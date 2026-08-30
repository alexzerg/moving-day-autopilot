import type { MoveCase, ProviderAccount } from '@moving-day/contracts';

export const sandboxCase: MoveCase = {
  id: 'move-fl-001',
  householdName: 'Rivera household',
  moveDate: '2026-09-15',
  oldAddress: { line1: '100 Harbor Lane', city: 'Hollywood', region: 'FL', postalCode: '33020', country: 'US' },
  newAddress: { line1: '800 Bay Avenue', city: 'Miami', region: 'FL', postalCode: '33130', country: 'US' },
  jurisdiction: 'US-FL',
  preferences: { internetOverlapDays: 2, maximumSetupCost: 150, preserveProvidersWhenPossible: true },
};

const source = 'https://inbox.moving-day.local';

export const sandboxAccounts: ProviderAccount[] = [
  ['electric', 'Florida Power & Light', 'electricity', 148],
  ['water', 'City Water Services', 'water', 62],
  ['internet', 'CableNet', 'internet', 79],
  ['renters', 'Sunstate Renters Insurance', 'insurance', 24],
  ['postal', 'USPS Address Service', 'postal', 0],
  ['employer', 'Northstar Payroll', 'employer', 0],
  ['bank', 'Atlantic Bank', 'financial', 0],
  ['mobile', 'MobileOne', 'mobile', 95],
  ['streaming', 'StreamBox', 'subscription', 18],
  ['gym', 'FitHarbor', 'subscription', 42],
  ['delivery', 'ParcelPass', 'delivery', 14],
].map(([id, provider, kind, monthlyCost]) => ({
  id: String(id),
  provider: String(provider),
  kind: kind as ProviderAccount['kind'],
  accountReference: `ACCT-${String(id).toUpperCase()}-42`,
  address: sandboxCase.oldAddress,
  monthlyCost: Number(monthlyCost),
  state: 'active-old',
  source,
}));
