import type { MoveCase, ProviderAccount } from '@moving-day/contracts';

export const demoCase: MoveCase = {
  id: 'move-fl-001',
  householdName: 'Rivera household',
  moveDate: '2026-09-15',
  oldAddress: { line1: '100 Harbor Lane', city: 'Hollywood', region: 'FL', postalCode: '33020', country: 'US' },
  newAddress: { line1: '800 Bay Avenue', city: 'Miami', region: 'FL', postalCode: '33130', country: 'US' },
  jurisdiction: 'US-FL',
  preferences: { internetOverlapDays: 2, maximumSetupCost: 150, preserveProvidersWhenPossible: true },
};

const source = 'https://demo.moving-day.invalid/inbox';

export const demoAccounts: ProviderAccount[] = [
  ['electric', 'Florida Power Demo', 'electricity', 148],
  ['water', 'Hollywood Water Demo', 'water', 62],
  ['internet', 'CableNet Demo', 'internet', 79],
  ['renters', 'Sunstate Renters Demo', 'insurance', 24],
  ['postal', 'Postal Forwarding Demo', 'postal', 0],
  ['employer', 'Northstar Payroll Demo', 'employer', 0],
  ['bank', 'Atlantic Bank Demo', 'financial', 0],
  ['mobile', 'MobileOne Demo', 'mobile', 95],
  ['streaming', 'StreamBox Demo', 'subscription', 18],
  ['gym', 'FitHarbor Demo', 'subscription', 42],
  ['delivery', 'ParcelPass Demo', 'delivery', 14],
].map(([id, provider, kind, monthlyCost]) => ({
  id: String(id),
  provider: String(provider),
  kind: kind as ProviderAccount['kind'],
  accountReference: `DEMO-${String(id).toUpperCase()}-42`,
  address: demoCase.oldAddress,
  monthlyCost: Number(monthlyCost),
  state: 'active-old',
  source,
}));
