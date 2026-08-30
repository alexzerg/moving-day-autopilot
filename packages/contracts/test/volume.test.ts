import { describe, expect, it } from 'vitest';
import { calculateMoveEstimate, householdBoxBaseline } from '../src/volume.js';

describe('physical move estimator', () => {
  it('uses household composition to seed boxes and recommends capacity above P90 volume', () => {
    const estimate = calculateMoveEstimate({
      household: 'two-adults-three-children',
      bedrooms: 2,
      crewSize: 3,
      originAccess: 'stairs',
      destinationAccess: 'ground',
      inventory: { sofas: 2, beds: 3, dressers: 3, tables: 1, desks: 2, appliances: 3, boxes: 0 },
    });
    expect(estimate.boxCount).toBe(householdBoxBaseline['two-adults-three-children']);
    expect(estimate.recommendedCapacityCuFt).toBeGreaterThan(estimate.p90VolumeCuFt);
    expect(estimate.trucks.every((truck) => truck.capacityCuFt >= estimate.recommendedCapacityCuFt)).toBe(true);
    expect(estimate.laborHours.total).toBeGreaterThan(0);
  });

  it('increases labor when both locations use stairs', () => {
    const base = { household: 'two-adults' as const, bedrooms: 1, crewSize: 2, inventory: { sofas: 1, beds: 1, dressers: 1, tables: 1, desks: 1, appliances: 2, boxes: 30 } };
    const ground = calculateMoveEstimate({ ...base, originAccess: 'ground', destinationAccess: 'ground' });
    const stairs = calculateMoveEstimate({ ...base, originAccess: 'stairs', destinationAccess: 'stairs' });
    expect(stairs.laborHours.total).toBeGreaterThan(ground.laborHours.total);
  });

  it('changes the recommended truck when inventory volume grows', () => {
    const small = calculateMoveEstimate({
      household: 'one-adult', bedrooms: 0, crewSize: 2, originAccess: 'ground', destinationAccess: 'ground',
      inventory: { sofas: 0, beds: 0, dressers: 0, tables: 0, desks: 0, appliances: 0, boxes: 0 },
    });
    const large = calculateMoveEstimate({
      household: 'two-adults-three-children', bedrooms: 6, crewSize: 4, originAccess: 'stairs', destinationAccess: 'stairs',
      inventory: { sofas: 6, beds: 8, dressers: 10, tables: 8, desks: 8, appliances: 10, boxes: 120 },
    });

    expect(small.trucks.map((truck) => truck.vehicle)).toEqual(['Cargo Van', 'Cargo Van']);
    expect(large.trucks.map((truck) => truck.vehicle)).toEqual(['29′ Truck', '26′ Truck']);
    expect(large.recommendedCapacityCuFt).toBeGreaterThan(small.recommendedCapacityCuFt);
    expect(large.trucks.every((truck) => truck.capacityRisk)).toBe(true);
  });
});
