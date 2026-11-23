"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapPinIcon, SearchIcon } from "./icons";
import styles from "./LocationPicker.module.css";

export type LocationPickerValue = {
  latitude: number;
  longitude: number;
  address: string;
  label: string | null;
};

export type LocationPickerProps = {
  initial?: LocationPickerValue | null;
  /** Reports whether the picker is busy (locating / searching / resolving the
      address) so the parent form can disable its submit button. */
  onPendingChange?: (pending: boolean) => void;
};

const GEOLOCATION_DENIED_MESSAGE =
  "Location access was denied. Allow location access for this site in your browser or device settings, then try again.";

const GEOLOCATION_UNAVAILABLE_MESSAGE =
  "Your device could not determine a location. Turn on Location Services/GPS, check your browser permission, and try again outdoors.";

const GEOLOCATION_TIMEOUT_MESSAGE =
  "Your location request timed out. Keep Location Services/GPS on, allow this site to use your location, and try again.";

const POOR_ACCURACY_METERS = 150;
const GOOD_ACCURACY_METERS = 50;
const FIX_WATCH_WINDOW_MS = 25000;

// Fallback map center before the user chooses a location.
const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 24 24" fill="#e5c034" stroke="#1f2937" stroke-width="1.1" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#1f2937" stroke="none"/></svg>';

type LeafletNamespace = typeof import("leaflet");
type LeafletMap = InstanceType<LeafletNamespace["Map"]>;
type LeafletMarker = InstanceType<LeafletNamespace["Marker"]>;

export default function LocationPicker({
  initial,
  onPendingChange,
}: LocationPickerProps) {
  const [latitude, setLatitude] = useState<number | null>(
    initial?.latitude ?? null
  );
  const [longitude, setLongitude] = useState<number | null>(
    initial?.longitude ?? null
  );
  const [address, setAddress] = useState(initial?.address ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // True while the reverse-geocoded address is being resolved so the parent
  // form can disable Save until the address has been filled in.
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const mountedRef = useRef(true);

  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);

  // Keeps async callbacks on the latest coordinates.
  const coordsRef = useRef<{ lat: number | null; lng: number | null }>({
    lat: initial?.latitude ?? null,
    lng: initial?.longitude ?? null,
  });

  // Accuracy is only meaningful for a browser GPS/network fix.
  // Manual map placement sets this to null because the user explicitly chose
  // the point on the map.
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);

  const setCoords = (lat: number, lng: number) => {
    coordsRef.current = { lat, lng };
    setLatitude(lat);
    setLongitude(lng);
  };

  const setManualCoords = (lat: number, lng: number) => {
    setCoords(lat, lng);
    setAccuracyMeters(null);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    setResolvingAddress(true);
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        address?: string;
        error?: string;
      };

      if (response.ok && payload.address) {
        setAddress(payload.address);
      } else {
        setStatus(
          "Your map pin is set, but the street address could not be matched automatically. Please type your full delivery address below."
        );
      }
    } catch {
      // Keep the address editable if reverse geocoding fails.
      setStatus(
        "Your map pin is set, but the address lookup failed. Please type your full delivery address below."
      );
    } finally {
      setResolvingAddress(false);
    }
  };

  const movePin = (lat: number, lng: number, flyTo: boolean) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const existing = markerRef.current;

    if (existing) {
      existing.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: PIN_SVG,
          iconSize: [34, 44],
          iconAnchor: [17, 42],
        }),
        draggable: true,
      }).addTo(map);

      marker.on("dragend", () => {
        const position = marker.getLatLng();

        setManualCoords(position.lat, position.lng);
        setError(null);
        setStatus(
          "Pin moved manually — this is now your selected delivery spot."
        );

        void reverseGeocode(position.lat, position.lng);
      });

      markerRef.current = marker;
    }

    if (flyTo) {
      map.flyTo([lat, lng], 17, { duration: 0.6 });
    }
  };

  const isPermissionDenied = (geoError: unknown): boolean =>
    geoError !== null &&
    typeof geoError === "object" &&
    "code" in geoError &&
    (geoError as { code?: unknown }).code === 1;

  const getGeolocationErrorMessage = (geoError: unknown): string => {
    if (isPermissionDenied(geoError)) return GEOLOCATION_DENIED_MESSAGE;

    const code =
      geoError !== null && typeof geoError === "object" && "code" in geoError
        ? (geoError as { code?: unknown }).code
        : null;

    if (code === 3) return GEOLOCATION_TIMEOUT_MESSAGE;
    if (code === 2) return GEOLOCATION_UNAVAILABLE_MESSAGE;
    return GEOLOCATION_UNAVAILABLE_MESSAGE;
  };

  /**
   * Keep a browser location watch open briefly so the device can improve an
   * initial coarse Wi-Fi/cell fix with a better GPS fix. Resolve with the best
   * accuracy reading seen, or fail with the browser's last location error.
   */
  const getBestPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      let best: GeolocationPosition | null = null;
      let lastError: GeolocationPositionError | null = null;
      let settled = false;
      let watchId: number | undefined;
      let timeoutId: number | undefined;

      const finish = (fallbackError?: unknown) => {
        if (settled) return;
        settled = true;

        if (watchId !== undefined) {
          navigator.geolocation.clearWatch(watchId);
        }
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }

        if (best) {
          resolve(best);
        } else {
          reject(fallbackError ?? lastError ?? new Error("Location unavailable"));
        }
      };

      try {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            if (
              !best ||
              position.coords.accuracy < best.coords.accuracy
            ) {
              best = position;
            }

            // Stop as soon as the device reports a reasonably precise fix.
            if (position.coords.accuracy <= GOOD_ACCURACY_METERS) {
              finish();
            }
          },
          (geoError) => {
            lastError = geoError;
            // Permission denial cannot improve by waiting or retrying.
            if (isPermissionDenied(geoError)) finish(geoError);
          },
          {
            enableHighAccuracy: true,
            timeout: FIX_WATCH_WINDOW_MS,
            maximumAge: 0,
          }
        );
      } catch (geoError) {
        finish(geoError);
        return;
      }

      timeoutId = window.setTimeout(() => {
        finish(lastError ?? new Error("Location request timed out"));
      }, FIX_WATCH_WINDOW_MS + 1000);
    });

  const useCurrentLocation = async () => {
    setError(null);
    setStatus(null);

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError(GEOLOCATION_UNAVAILABLE_MESSAGE);
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Browser location requires a secure connection. Open the store using its HTTPS address and try again."
      );
      return;
    }

    setLocating(true);
    setStatus(
      "Finding your location… Keep this page open while your device refines the GPS reading."
    );

    let best: GeolocationPosition;
    try {
      best = await getBestPosition();
    } catch (geoError) {
      if (!mountedRef.current) return;
      setLocating(false);
      setError(getGeolocationErrorMessage(geoError));
      return;
    }

    if (!mountedRef.current) return;

    setLocating(false);

    const lat = best.coords.latitude;
    const lng = best.coords.longitude;
    const accuracy = Math.round(best.coords.accuracy);

    setCoords(lat, lng);
    setAccuracyMeters(accuracy);
    movePin(lat, lng, true);

    if (accuracy > POOR_ACCURACY_METERS) {
      setStatus(
        `Best location found is still only about ±${accuracy} m. ` +
          "This is an approximate device reading. Please drag the pin to your exact delivery spot before saving."
      );
    } else if (accuracy > GOOD_ACCURACY_METERS) {
      setStatus(
        `Best location found (±${accuracy} m). ` +
          "Review the pin and move it if needed before saving."
      );
    } else {
      setStatus(
        `Precise location found (±${accuracy} m). ` +
          "Review the pin and address before saving."
      );
    }

    // Resolve the street address after the best available pin is placed.
    void reverseGeocode(lat, lng);
  };

  const findAddress = async () => {
    const query = searchQuery.trim();

    if (!query) {
      setError("Type an address, street or landmark to search.");
      return;
    }

    setError(null);
    setStatus(null);
    setSearching(true);

    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query }),
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        latitude?: number;
        longitude?: number;
        address?: string;
        error?: string;
      };

      if (
        !response.ok ||
        typeof payload.latitude !== "number" ||
        typeof payload.longitude !== "number"
      ) {
        setError(payload.error ?? "We couldn't find that address. Try again.");
        return;
      }

      setCoords(payload.latitude, payload.longitude);
      setAccuracyMeters(null);
      setAddress(payload.address ?? query);
      setStatus(
        "Address found. Please review the pin and move it if necessary."
      );
      movePin(payload.latitude, payload.longitude, true);
    } catch {
      setError("We couldn't look up that address right now. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const L = await import("leaflet");

      if (cancelled || !mapHostRef.current) return;

      leafletRef.current = L;

      map = L.map(mapHostRef.current, {
        zoomControl: true,
      });

      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      const { lat, lng } = coordsRef.current;

      map.setView(
        lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER,
        lat !== null && lng !== null ? 17 : 15
      );

      map.on("click", (event) => {
        setManualCoords(event.latlng.lat, event.latlng.lng);
        setError(null);
        setStatus(
          "Pin placed manually — review the address below, then continue."
        );

        movePin(event.latlng.lat, event.latlng.lng, false);
        void reverseGeocode(event.latlng.lat, event.latlng.lng);
      });

      if (lat !== null && lng !== null) {
        movePin(lat, lng, false);
      }

      resizeObserver = new ResizeObserver(() => {
        map?.invalidateSize();
      });

      resizeObserver.observe(mapHostRef.current);

      requestAnimationFrame(() => map?.invalidateSize());
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();

      mapRef.current = null;
      markerRef.current = null;
      leafletRef.current = null;
    };
    // Map is intentionally initialized once after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps async callbacks from updating state after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Let the parent form disable Save while the picker is busy (locating,
  // searching, or resolving the address).
  const pending = locating || searching || resolvingAddress;
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  return (
    <div className={styles.wrapper}>
      <input type="hidden" name="latitude" value={latitude ?? ""} />
      <input type="hidden" name="longitude" value={longitude ?? ""} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="label" value={label} />

      {/* Useful for server-side validation when coordinates came from GPS.
          Manual map selection intentionally sends an empty value. */}
      <input
        type="hidden"
        name="locationAccuracy"
        value={accuracyMeters ?? ""}
      />

      <button
        type="button"
        className={styles.locateButton}
        onClick={useCurrentLocation}
        disabled={locating}
        aria-busy={locating}
      >
        <MapPinIcon size={16} />
        {locating ? "Getting your precise location…" : "Use my current location"}
      </button>

      <div className={styles.searchRow}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Or type your address to find it…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void findAddress();
            }
          }}
          aria-label="Search for an address"
        />

        <button
          type="button"
          className={styles.searchButton}
          onClick={() => void findAddress()}
          disabled={searching}
        >
          <SearchIcon size={14} />
          {searching ? "Finding…" : "Find"}
        </button>
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {status ? (
        <p role="status" className={styles.status}>
          {status}
        </p>
      ) : null}

      <div className={styles.mapFrame}>
        <div
          ref={mapHostRef}
          className={styles.map}
          aria-label="Your delivery location on the map"
        />
      </div>

      <p className={styles.mapHint}>
        Tip: drag the pin or tap the map to fine-tune the exact delivery spot.
      </p>

      <div className={styles.field}>
        <label htmlFor="loc-label" className={styles.label}>
          Location label (optional):
        </label>

        <input
          id="loc-label"
          type="text"
          className={styles.input}
          placeholder="e.g. Home, Office"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="loc-address" className={styles.label}>
          Delivery address:
        </label>

        <textarea
          id="loc-address"
          name="address-display"
          className={styles.textarea}
          rows={3}
          placeholder="Street, barangay, city, province"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          required
        />
      </div>
    </div>
  );
}
