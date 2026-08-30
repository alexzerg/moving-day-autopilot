import { z } from 'zod';

type Address = { line1: string; city: string; region: string; postalCode: string; country: string };

const ResolvedAddressValueSchema = z.object({
  line1: z.string().min(1),
  city: z.string().min(1),
  region: z.string().length(2),
  postalCode: z.string().min(5),
  country: z.literal('US'),
});

export const ResolvedAddressSchema = z.object({
  address: ResolvedAddressValueSchema,
  latitude: z.number(),
  longitude: z.number(),
  matchedAddress: z.string().min(1),
  source: z.enum(['us-census', 'openstreetmap']),
});

export const RouteDistanceSchema = z.object({
  distanceMiles: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  source: z.enum(['google-routes', 'census-osrm']),
  originMatch: z.string().min(1),
  destinationMatch: z.string().min(1),
});

export type ResolvedAddress = z.infer<typeof ResolvedAddressSchema>;
export type RouteDistance = z.infer<typeof RouteDistanceSchema>;

type FetchLike = typeof globalThis.fetch;
type RouteOptions = { googleMapsApiKey?: string; fetch?: FetchLike };

async function fetchWithRetry(fetcher: FetchLike, input: string | URL, init: RequestInit, timeoutMs: number, attempts = 3) {
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetcher(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
  }
  if (response) return response;
  throw lastError instanceof Error ? lastError : new Error('External route service request failed');
}

function addressLine(address: Address) {
  return `${address.line1}, ${address.city}, ${address.region} ${address.postalCode}, ${address.country}`;
}

async function googleRoute(origin: Address, destination: Address, apiKey: string, fetcher: FetchLike): Promise<RouteDistance> {
  const response = await fetchWithRetry(fetcher, 'https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: { address: addressLine(origin) },
      destination: { address: addressLine(destination) },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      units: 'IMPERIAL',
    }),
  }, 15_000);
  if (!response.ok) throw new Error(`Google Routes failed with HTTP ${response.status}`);
  const body = await response.json() as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
  const route = body.routes?.[0];
  if (!route?.distanceMeters || !route.duration) throw new Error('Google Routes returned no driving route');
  const durationSeconds = Number(route.duration.replace(/s$/, ''));
  return RouteDistanceSchema.parse({
    distanceMiles: Math.round((route.distanceMeters / 1609.344) * 10) / 10,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    source: 'google-routes',
    originMatch: addressLine(origin),
    destinationMatch: addressLine(destination),
  });
}

async function censusLookup(query: string, fetcher: FetchLike) {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');
  const response = await fetchWithRetry(fetcher, url, {}, 15_000);
  if (!response.ok) throw new Error(`Census geocoder failed with HTTP ${response.status}`);
  const body = await response.json() as {
    result?: { addressMatches?: Array<{ matchedAddress?: string; coordinates?: { x?: number; y?: number } }> };
  };
  const match = body.result?.addressMatches?.[0];
  if (!match?.matchedAddress || typeof match.coordinates?.x !== 'number' || typeof match.coordinates?.y !== 'number') {
    throw new Error(`Address not found: ${query}`);
  }
  return { longitude: match.coordinates.x, latitude: match.coordinates.y, matchedAddress: match.matchedAddress };
}

async function nominatimResolve(query: string, fetcher: FetchLike): Promise<ResolvedAddress> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', /\bfl(?:orida)?\b/i.test(query) ? query : `${query}, Florida`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('viewbox', '-83.8,28.8,-76.8,22.8');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('limit', '8');
  const response = await fetchWithRetry(fetcher, url, {
    headers: { 'User-Agent': 'Moving-Day-Autopilot/0.1 (+https://moving-day-autopilot.vercel.app)' },
  }, 15_000);
  if (!response.ok) throw new Error(`Address search failed with HTTP ${response.status}`);
  const results = await response.json() as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: Record<string, string | undefined>;
  }>;
  const match = results.find((candidate) => {
    const state = candidate.address?.state ?? '';
    return state.toLowerCase() === 'florida' && Boolean(candidate.address?.postcode && candidate.address?.road && candidate.address?.house_number);
  });
  if (!match?.address || !match.display_name || !match.lat || !match.lon) throw new Error(`Address not found in the supported Florida area: ${query}`);
  const city = match.address.city ?? match.address.town ?? match.address.village ?? match.address.municipality ?? match.address.county;
  if (!city) throw new Error(`City could not be resolved for address: ${query}`);
  return ResolvedAddressSchema.parse({
    address: {
      line1: `${match.address.house_number} ${match.address.road}`,
      city,
      region: 'FL',
      postalCode: match.address.postcode?.slice(0, 5),
      country: 'US',
    },
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    matchedAddress: match.display_name,
    source: 'openstreetmap',
  });
}

export async function resolveUsAddress(query: string, options: { fetch?: FetchLike } = {}): Promise<ResolvedAddress> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 5) throw new Error('Enter a street number and street name.');
  const fetcher = options.fetch ?? globalThis.fetch;
  if (normalizedQuery.includes(',')) {
    try {
      const match = await censusLookup(normalizedQuery, fetcher);
      const parts = match.matchedAddress.split(',').map((part) => part.trim());
      if (parts.length >= 4) {
        return ResolvedAddressSchema.parse({
          address: { line1: parts[0], city: parts[1], region: parts[2].slice(0, 2).toUpperCase(), postalCode: parts[3].slice(0, 5), country: 'US' },
          latitude: match.latitude,
          longitude: match.longitude,
          matchedAddress: match.matchedAddress,
          source: 'us-census',
        });
      }
    } catch {
      // Fall through to the bounded Florida address search.
    }
  }
  return nominatimResolve(normalizedQuery, fetcher);
}

async function censusCoordinates(address: Address, fetcher: FetchLike) {
  return censusLookup(addressLine(address), fetcher);
}

async function osrmRoute(
  from: { longitude: number; latitude: number; matchedAddress: string },
  to: { longitude: number; latitude: number; matchedAddress: string },
  fetcher: FetchLike,
): Promise<RouteDistance> {
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('steps', 'false');
  const response = await fetchWithRetry(fetcher, url, {}, 20_000);
  if (!response.ok) throw new Error(`Road router failed with HTTP ${response.status}`);
  const body = await response.json() as { code?: string; routes?: Array<{ distance?: number; duration?: number }> };
  const route = body.routes?.[0];
  if (body.code !== 'Ok' || !route?.distance || !route.duration) throw new Error('Road router returned no driving route');
  return RouteDistanceSchema.parse({
    distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    source: 'census-osrm',
    originMatch: from.matchedAddress,
    destinationMatch: to.matchedAddress,
  });
}

async function censusOsrmRoute(origin: Address, destination: Address, fetcher: FetchLike): Promise<RouteDistance> {
  const [from, to] = await Promise.all([censusCoordinates(origin, fetcher), censusCoordinates(destination, fetcher)]);
  return osrmRoute(from, to, fetcher);
}

export async function calculateRoadRouteFromResolved(origin: ResolvedAddress, destination: ResolvedAddress, options: RouteOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (options.googleMapsApiKey) return googleRoute(origin.address, destination.address, options.googleMapsApiKey, fetcher);
  return osrmRoute(
    { longitude: origin.longitude, latitude: origin.latitude, matchedAddress: origin.matchedAddress },
    { longitude: destination.longitude, latitude: destination.latitude, matchedAddress: destination.matchedAddress },
    fetcher,
  );
}

export async function calculateRoadRoute(origin: Address, destination: Address, options: RouteOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (options.googleMapsApiKey) return googleRoute(origin, destination, options.googleMapsApiKey, fetcher);
  return censusOsrmRoute(origin, destination, fetcher);
}
