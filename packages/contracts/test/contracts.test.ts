import { describe, expect, it } from 'vitest';
import { floridaJurisdictionPack } from '../src/florida.js';
import { JurisdictionPackSchema, MoveCaseSchema } from '../src/index.js';

describe('shared contracts', () => {
  it('validates the Florida jurisdiction pack', () => {
    expect(JurisdictionPackSchema.parse(floridaJurisdictionPack).id).toBe('US-FL');
  });

  it('rejects a move case without a country code', () => {
    expect(() => MoveCaseSchema.parse({
      id: 'case-1', householdName: 'Sandbox household', moveDate: '2026-09-15',
      oldAddress: { line1: '1 Old St', city: 'Hollywood', region: 'FL', postalCode: '33020' },
      newAddress: { line1: '2 New St', city: 'Miami', region: 'FL', postalCode: '33101', country: 'US' },
      jurisdiction: 'US-FL',
      preferences: { internetOverlapDays: 2, maximumSetupCost: 150, preserveProvidersWhenPossible: true },
    })).toThrow();
  });
});
