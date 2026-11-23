import { NextRequest, NextResponse } from "next/server";

/**
 * Geocoding proxy.
 *
 * Forward:
 *   { "address": "123 Example St" }
 *
 * Reverse:
 *   { "latitude": 14.5995, "longitude": 120.9842 }
 *
 * Nominatim is used server-side so the request has an application-identifying
 * User-Agent and Referer. Requests are only made in response to user actions.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://lnr-cycle-center.vercel.app"
).replace(/\/+$/, "");
const USER_AGENT = `LnRCycleCenter/1.1 (${SITE_ORIGIN})`;

type GeocodeResponse = {
  latitude: number;
  longitude: number;
  address: string;
};

type NominatimSearchResult = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
};

type NominatimReverseResult = {
  display_name?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    if (
      typeof body.latitude === "number" &&
      typeof body.longitude === "number" &&
      Number.isFinite(body.latitude) &&
      Number.isFinite(body.longitude) &&
      body.latitude >= -90 &&
      body.latitude <= 90 &&
      body.longitude >= -180 &&
      body.longitude <= 180
    ) {
      return await reverseGeocode(body.latitude, body.longitude);
    }

    const address =
      typeof body.address === "string" ? body.address.trim() : "";

    if (address) {
      return await forwardGeocode(address);
    }

    return NextResponse.json(
      { error: "Provide an address, or latitude and longitude." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[geocode] lookup failed:", error);

    return NextResponse.json(
      { error: "We couldn't look up that location. Please try again." },
      { status: 502 }
    );
  }
}

async function forwardGeocode(address: string): Promise<NextResponse> {
  const url = new URL(`${NOMINATIM_URL}/search`);

  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  // Constrain lookups to the Philippines. Without this, common names can
  // resolve to foreign places before the customer's town/barangay.
  url.searchParams.set("countrycodes", "ph");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: `${SITE_ORIGIN}/`,
      Accept: "application/json",
    },
    // Cache identical user-triggered lookups for a day to reduce load on the
    // public Nominatim service and comply with its caching guidance.
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    console.error("[geocode] Nominatim search failed:", response.status);

    return NextResponse.json(
      {
        error:
          "The address lookup service is unavailable. Please try again later.",
      },
      { status: 502 }
    );
  }

  const results = (await response.json()) as NominatimSearchResult[];

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json(
      {
        error:
          "We couldn't find that address. Try adding the barangay, city, or province.",
      },
      { status: 404 }
    );
  }

  const best = results[0];
  const latitude = Number(best.lat);
  const longitude = Number(best.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !best.display_name
  ) {
    return NextResponse.json(
      { error: "The address lookup returned an invalid location." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    latitude,
    longitude,
    address: best.display_name,
  } satisfies GeocodeResponse);
}

async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<NextResponse> {
  const url = new URL(`${NOMINATIM_URL}/reverse`);

  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: `${SITE_ORIGIN}/`,
      Accept: "application/json",
    },
    // Cache identical user-triggered lookups for a day to reduce load on the
    // public Nominatim service and comply with its caching guidance.
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    console.error("[geocode] Nominatim reverse failed:", response.status);

    return NextResponse.json(
      {
        error:
          "The location lookup service is unavailable. Please type your full delivery address.",
      },
      { status: 502 }
    );
  }

  const result = (await response.json()) as NominatimReverseResult;

  return NextResponse.json({
    latitude,
    longitude,
    address: result.display_name ?? "Selected location",
  } satisfies GeocodeResponse);
}
