import { z } from 'zod';

export const HouseholdProfileSchema = z.enum(['one-adult', 'two-adults', 'two-adults-one-child', 'two-adults-two-children', 'two-adults-three-children']);
export type HouseholdProfile = z.infer<typeof HouseholdProfileSchema>;

export const AccessTypeSchema = z.enum(['ground', 'elevator', 'stairs']);
export type AccessType = z.infer<typeof AccessTypeSchema>;

export const PhysicalMoveProfileSchema = z.object({
  household: HouseholdProfileSchema,
  bedrooms: z.number().int().min(0).max(6),
  crewSize: z.number().int().min(2).max(4),
  originAccess: AccessTypeSchema,
  destinationAccess: AccessTypeSchema,
  inventory: z.object({
    sofas: z.number().int().min(0).max(10),
    beds: z.number().int().min(0).max(12),
    dressers: z.number().int().min(0).max(20),
    tables: z.number().int().min(0).max(12),
    desks: z.number().int().min(0).max(12),
    appliances: z.number().int().min(0).max(20),
    boxes: z.number().int().min(0).max(300),
  }),
});
export type PhysicalMoveProfile = z.infer<typeof PhysicalMoveProfileSchema>;

export type TruckRecommendation = {
  provider: 'U-Haul' | 'Penske';
  vehicle: string;
  capacityCuFt: number;
  bufferPct: number;
  capacityRisk: boolean;
};

export type MoveEstimate = {
  rawVolumeCuFt: number;
  expectedVolumeCuFt: number;
  p90VolumeCuFt: number;
  recommendedCapacityCuFt: number;
  estimatedWeightLb: { low: number; high: number };
  boxCount: number;
  laborHours: { crewSize: number; loading: number; unloading: number; total: number };
  trucks: TruckRecommendation[];
  confidence: 'quick' | 'inventory';
};

export const householdBoxBaseline: Record<HouseholdProfile, number> = {
  'one-adult': 18,
  'two-adults': 30,
  'two-adults-one-child': 42,
  'two-adults-two-children': 52,
  'two-adults-three-children': 62,
};

const itemVolume = { sofas: 65, beds: 70, dressers: 35, tables: 35, desks: 25, appliances: 45 } as const;
const uhaul = [
  ['Cargo Van', 245], ['10′ Truck', 402], ['15′ Truck', 764], ['20′ Truck', 1016], ['26′ Truck', 1682],
] as const;
const penske = [
  ['Cargo Van', 404], ['12′ Truck', 450], ['16′ Truck', 800], ['22′ Truck', 1200], ['26′ Truck', 1700],
] as const;

function halfHour(value: number) {
  return Math.ceil(value * 2) / 2;
}

function recommend(provider: 'U-Haul' | 'Penske', fleet: ReadonlyArray<readonly [string, number]>, required: number): TruckRecommendation {
  const selected = fleet.find(([, capacity]) => capacity >= required) ?? fleet[fleet.length - 1];
  const bufferPct = ((selected[1] - required) / selected[1]) * 100;
  return { provider, vehicle: selected[0], capacityCuFt: selected[1], bufferPct: Number(bufferPct.toFixed(1)), capacityRisk: selected[1] < required || bufferPct < 8 };
}

export function calculateMoveEstimate(input: PhysicalMoveProfile): MoveEstimate {
  const profile = PhysicalMoveProfileSchema.parse(input);
  const boxCount = Math.max(profile.inventory.boxes, householdBoxBaseline[profile.household]);
  const furnitureVolume = (Object.keys(itemVolume) as Array<keyof typeof itemVolume>)
    .reduce((total, key) => total + profile.inventory[key] * itemVolume[key], 0);
  const bedroomLooseItems = profile.bedrooms * 35;
  const rawVolume = furnitureVolume + boxCount * 3.5 + bedroomLooseItems;
  const expected = Math.round(rawVolume * 1.08);
  const p90 = Math.round(expected * 1.12);
  const recommended = Math.round(p90 * 1.05);
  const accessFactor = ({ ground: 1, elevator: 1.15, stairs: 1.35 }[profile.originAccess]
    + { ground: 1, elevator: 1.15, stairs: 1.35 }[profile.destinationAccess]) / 2;
  const loading = halfHour((expected / (profile.crewSize * 110)) * accessFactor);
  const unloading = halfHour((expected / (profile.crewSize * 150)) * accessFactor);
  return {
    rawVolumeCuFt: Math.round(rawVolume),
    expectedVolumeCuFt: expected,
    p90VolumeCuFt: p90,
    recommendedCapacityCuFt: recommended,
    estimatedWeightLb: { low: Math.round(expected * 6), high: Math.round(expected * 8) },
    boxCount,
    laborHours: { crewSize: profile.crewSize, loading, unloading, total: loading + unloading },
    trucks: [recommend('U-Haul', uhaul, recommended), recommend('Penske', penske, recommended)],
    confidence: 'inventory',
  };
}
