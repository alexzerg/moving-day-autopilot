import { describe, expect, it, vi } from 'vitest';
import { calculateRoadRoute, calculateRoadRouteFromResolved, resolveUsAddress } from '../src/routing.js';

const origin = { line1: '1600 Pennsylvania Avenue NW', city: 'Washington', region: 'DC', postalCode: '20500', country: 'US' };
const destination = { line1: '1 First Street NE', city: 'Washington', region: 'DC', postalCode: '20543', country: 'US' };

describe('road route calculation', () => {
  it('normalizes a one-line address and derives ZIP automatically', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: '100 N ANDREWS AVE, FORT LAUDERDALE, FL, 33301', coordinates: { x: -80.1434, y: 26.1239 } }] } }), { status: 200 }));

    const resolved = await resolveUsAddress('100 N Andrews Ave, Fort Lauderdale, FL', { fetch: fetcher });

    expect(resolved.address).toEqual({ line1: '100 N ANDREWS AVE', city: 'FORT LAUDERDALE', region: 'FL', postalCode: '33301', country: 'US' });
    expect(resolved.matchedAddress).toContain('33301');
    expect(resolved.source).toBe('us-census');
  });

  it('retries transient geocoder failures before resolving the address', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: '100 N ANDREWS AVE, FORT LAUDERDALE, FL, 33301', coordinates: { x: -80.1434, y: 26.1239 } }] } }), { status: 200 }));

    const resolved = await resolveUsAddress('100 N Andrews Ave, Fort Lauderdale, FL', { fetch: fetcher });

    expect(resolved.address.postalCode).toBe('33301');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses Census coordinates and OSRM driving distance without an API key', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500', coordinates: { x: -77.0365, y: 38.8977 } }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: '1 FIRST ST NE, WASHINGTON, DC, 20543', coordinates: { x: -77.0047, y: 38.8906 } }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 6437.376, duration: 720 }] }), { status: 200 }));

    const route = await calculateRoadRoute(origin, destination, { fetch: fetcher });

    expect(route).toEqual({
      distanceMiles: 4,
      durationMinutes: 12,
      source: 'census-osrm',
      originMatch: '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500',
      destinationMatch: '1 FIRST ST NE, WASHINGTON, DC, 20543',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('prefers Google Routes when a server API key is configured', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distanceMeters: 16093.44, duration: '900s' }] }), { status: 200 }));

    const route = await calculateRoadRoute(origin, destination, { googleMapsApiKey: 'server-key', fetch: fetcher });

    expect(route.distanceMiles).toBe(10);
    expect(route.durationMinutes).toBe(15);
    expect(route.source).toBe('google-routes');
    expect(fetcher).toHaveBeenCalledWith('https://routes.googleapis.com/directions/v2:computeRoutes', expect.objectContaining({ method: 'POST' }));
  });
});
