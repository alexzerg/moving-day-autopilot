import { describe, expect, it } from 'vitest';
import { buildGmailSearchQueries, decodeAgentCoreResponse, isAllowedGoogleEmail, isHouseholdBillCandidate, mergeCatalogRelationshipCandidates } from './server.js';

describe('AgentCore bridge decoding', () => {
  it('separates agent prose from authoritative state', () => {
    const state = { moveCase: { id: 'move-fl-001' }, accounts: [{ id: 'electric' }] };
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
    const decoded = decodeAgentCoreResponse([
      'data: "I found 11 services."',
      `data: "\\n__MOVE_STATE__${encoded}"`,
      '',
    ].join('\n'));

    expect(decoded.text).toBe('I found 11 services.');
    expect(decoded.state).toEqual(state);
  });
});

describe('Google account allowlist', () => {
  it('accepts only the configured owner email using normalized comparison', () => {
    expect(isAllowedGoogleEmail(' Alex1Zerg@gmail.com ', 'alex1zerg@gmail.com')).toBe(true);
    expect(isAllowedGoogleEmail('someone-else@gmail.com', 'alex1zerg@gmail.com')).toBe(false);
    expect(isAllowedGoogleEmail(undefined, 'alex1zerg@gmail.com')).toBe(false);
    expect(isAllowedGoogleEmail('alex1zerg@gmail.com', undefined)).toBe(false);
  });
});

describe('Gmail catalog relationship candidates', () => {
  it('adds FPL deterministically when Nova did not extract a bill account', () => {
    const state: { accounts: Array<Record<string, unknown>> } = { accounts: [] };
    const added = mergeCatalogRelationshipCandidates(state, [{ name: 'Florida Power & Light', category: 'electricity', domains: ['fpl.com'], aliases: ['fpl'] }], {
      line1: '1931 Arthur St', city: 'Hollywood', region: 'FL', postalCode: '33020', country: 'US',
    });

    expect(added).toEqual(['Florida Power & Light']);
    expect(state.accounts).toContainEqual(expect.objectContaining({ provider: 'Florida Power & Light', kind: 'electricity', accountReference: '••••SHIP', monthlyCost: 0, state: 'discovered' }));
    expect(mergeCatalogRelationshipCandidates(state, [{ name: 'Florida Power & Light', category: 'electricity', domains: ['fpl.com'], aliases: ['fpl'] }], {
      line1: '1931 Arthur St', city: 'Hollywood', region: 'FL', postalCode: '33020', country: 'US',
    })).toEqual([]);
  });
});

describe('Gmail bill and statement discovery', () => {
  it('limits every provider search to six months and preserves SunPass, address and catalog coverage', () => {
    const queries = buildGmailSearchQueries({
      line1: '100 Harbor Lane',
      city: 'Hollywood',
      region: 'FL',
      postalCode: '33020',
      country: 'US',
    });

    expect(queries[0]).toEqual({
      label: 'sunpass-and-florida-turnpike',
      query: 'newer_than:6m {from:sunpass from:floridasturnpike.com from:fdot.gov subject:sunpass "SunPass" "Florida Turnpike"}',
      priority: 300,
    });
    expect(queries).toContainEqual({ label: 'account-at-old-address', query: 'newer_than:6m "100 Harbor Lane"', priority: 120 });
    expect(queries.some((query) => query.query.includes('"33020"'))).toBe(true);
    expect(queries.some((query) => query.label.startsWith('move-provider-catalog-') && query.query.includes('from:fpl.com'))).toBe(true);
    expect(queries.some((query) => query.label.startsWith('move-provider-catalog-') && query.query.includes('from:chase.com'))).toBe(true);
    expect(queries.every((query) => query.query.startsWith('newer_than:6m'))).toBe(true);
    expect(queries.every((query) => !query.query.includes('newer_than:36m'))).toBe(true);
  });

  it('accepts bill and statement evidence while rejecting mover receipts', () => {
    expect(isHouseholdBillCandidate('billing@unknown-provider.com', 'Your bill is ready', 'Amount due $84 on September 4')).toBe(true);
    expect(isHouseholdBillCandidate('alerts@bank.example', 'Your monthly statement is ready', 'Statement balance and account ending 1234')).toBe(true);
    expect(isHouseholdBillCandidate('hello@taskrabbit.com', 'Your bill is ready', 'Payment received for moving help')).toBe(false);
    expect(isHouseholdBillCandidate('news@unknown-provider.com', 'Weekly offers', 'Amount due')).toBe(false);
  });
});
