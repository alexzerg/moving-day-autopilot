import type { JurisdictionPack } from './index.js';

export const floridaJurisdictionPack: JurisdictionPack = {
  id: 'US-FL',
  version: '2026-08-29',
  country: 'US',
  region: 'Florida',
  addressFormat: 'USPS',
  supportedServices: [
    'electricity', 'water', 'internet', 'insurance', 'postal',
    'employer', 'financial', 'mobile', 'subscription', 'delivery',
  ],
  rules: [
    {
      id: 'postal-forwarding',
      title: 'Prepare an official postal address-change task',
      classification: 'recommended',
      humanIdentityRequired: true,
      sourceUrl: 'https://moversguide.usps.com/',
      checkedAt: '2026-08-29',
    },
    {
      id: 'driver-record-guidance',
      title: 'Prepare a state driver-record address-update task',
      classification: 'required',
      humanIdentityRequired: true,
      sourceUrl: 'https://www.flhsmv.gov/name-and-address-changes/',
      checkedAt: '2026-08-29',
    },
    {
      id: 'utility-overlap',
      title: 'Activate essential utilities before closing the old service',
      classification: 'recommended',
      humanIdentityRequired: false,
      sourceUrl: 'https://www.usa.gov/moving',
      checkedAt: '2026-08-29',
    },
  ],
};
