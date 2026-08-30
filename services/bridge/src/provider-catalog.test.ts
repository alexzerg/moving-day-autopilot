import { describe, expect, it } from 'vitest';
import { catalogDomainGroups, classifyMoveRelevantMessage, matchCatalogProvider } from './provider-catalog.js';

describe('move-relevant provider catalog', () => {
  it('matches key utility, telecom, banking and insurance providers', () => {
    expect(matchCatalogProvider('billing@email.fpl.com', 'Your account', '')?.name).toBe('Florida Power & Light');
    expect(matchCatalogProvider('online.communications@alerts.comcast.net', 'Xfinity statement', '')?.name).toBe('Xfinity');
    expect(matchCatalogProvider('no.reply.alerts@chase.com', 'Statement ready', '')?.name).toBe('Chase');
    expect(matchCatalogProvider('service@geico.com', 'Policy bill', '')?.name).toBe('GEICO');
  });

  it('accepts indirect account-relationship evidence from a catalog provider', () => {
    expect(classifyMoveRelevantMessage('alerts@email.fpl.com', 'Power outage update for your account', 'Your electric service may be affected')).toMatchObject({ accepted: true, reason: 'catalog provider with account-relationship evidence' });
  });

  it('accepts account evidence from an unknown provider', () => {
    expect(classifyMoveRelevantMessage('billing@localwater.example', 'Your invoice', 'Account number 1234. Amount due $82.')).toMatchObject({ accepted: true, provider: null });
  });

  it('rejects portable subscriptions and advertising', () => {
    expect(classifyMoveRelevantMessage('billing@netflix.com', 'Your bill', 'Amount due $20')).toMatchObject({ accepted: false, reason: 'portable subscription' });
    expect(classifyMoveRelevantMessage('offers@xfinity.com', 'Special offer', 'Upgrade now and save 40%')).toMatchObject({ accepted: false, reason: 'advertising' });
  });

  it('creates Gmail domain groups that include every catalog domain', () => {
    const groups = catalogDomainGroups();
    expect(groups.flat()).toEqual(expect.arrayContaining(['fpl.com', 'xfinity.com', 'chase.com', 'geico.com']));
    expect(groups.every((group) => group.length <= 12)).toBe(true);
  });
});
