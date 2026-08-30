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
});
