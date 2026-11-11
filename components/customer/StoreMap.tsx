"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import styles from "./StoreMap.module.css";
import { STORE_COORDINATES } from "@/lib/store-location";
export default function StoreMap() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let map: import("leaflet").Map | null = null;
    let observer: ResizeObserver | null = null;
    void import("leaflet").then(L => {
      if (!active || !host.current) return;
      const center: [number, number] = [STORE_COORDINATES.latitude, STORE_COORDINATES.longitude];
      map = L.map(host.current, { scrollWheelZoom: false }).setView(center, 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const pin = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 39S1 24 1 14a13 13 0 0 1 26 0c0 10-13 25-13 25Z" fill="#2489c5" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>';
      L.marker(center, { icon: L.icon({ iconUrl: `data:image/svg+xml,${encodeURIComponent(pin)}`, iconSize: [28, 40], iconAnchor: [14, 39] }), title: "LNR Cycle Center" }).addTo(map).bindTooltip("LNR Cycle Center");
      if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(() => map?.invalidateSize()); observer.observe(host.current); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; observer?.disconnect(); map?.remove(); };
  }, []);
  return <div className={styles.container}><div ref={host} className={styles.map} role="region" aria-label="OpenStreetMap showing LNR Cycle Center. Drag to explore and use the plus and minus buttons to zoom."/>{error ? <p className={styles.error}>The map could not load. <a href={`https://www.openstreetmap.org/?mlat=${STORE_COORDINATES.latitude}&mlon=${STORE_COORDINATES.longitude}#map=17/${STORE_COORDINATES.latitude}/${STORE_COORDINATES.longitude}`} target="_blank" rel="noreferrer">Open OpenStreetMap</a>.</p> : null}</div>;
}
