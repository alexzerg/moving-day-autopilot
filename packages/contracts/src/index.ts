import { z } from 'zod';
import type { MoveEstimate, PhysicalMoveProfile } from './volume.js';

export const ServiceKindSchema = z.enum([
  'electricity',
  'water',
  'internet',
  'insurance',
  'postal',
  'employer',
  'financial',
  'mobile',
  'subscription',
  'delivery',
]);
export type ServiceKind = z.infer<typeof ServiceKindSchema>;

export const ActionRiskSchema = z.enum(['automatic', 'approval', 'identity']);
export type ActionRisk = z.infer<typeof ActionRiskSchema>;

export const ActionStatusSchema = z.enum(['planned', 'blocked', 'executed', 'verified', 'failed']);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const AddressSchema = z.object({
  line1: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().length(2),
});
export type Address = z.infer<typeof AddressSchema>;

export const MoveCaseSchema = z.object({
  id: z.string().min(1),
  householdName: z.string().min(1),
  moveDate: z.string().date(),
  oldAddress: AddressSchema,
  newAddress: AddressSchema,
  jurisdiction: z.string().min(1),
  preferences: z.object({
    internetOverlapDays: z.number().int().min(0).max(14),
    maximumSetupCost: z.number().nonnegative(),
    preserveProvidersWhenPossible: z.boolean(),
  }),
});
export type MoveCase = z.infer<typeof MoveCaseSchema>;

export const EvidenceDocumentSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1).max(12000),
});
export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;

export const EvidenceAccountSchema = z.object({
  provider: z.string().min(1),
  kind: ServiceKindSchema,
  accountReference: z.string().min(1),
  monthlyCost: z.number().nonnegative(),
  sourceName: z.string().min(1),
  serviceAddress: z.string().min(1),
});
export type EvidenceAccount = z.infer<typeof EvidenceAccountSchema>;

export const ProviderAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  kind: ServiceKindSchema,
  accountReference: z.string().min(1),
  address: AddressSchema,
  monthlyCost: z.number().nonnegative(),
  state: z.enum(['active-old', 'scheduled-new', 'active-new', 'closed', 'pending']),
  source: z.string().url(),
});
export type ProviderAccount = z.infer<typeof ProviderAccountSchema>;

export const MoveActionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['activate', 'schedule', 'update-address', 'cancel', 'collect-final-bill', 'verify']),
  scheduledFor: z.string().date(),
  dependencies: z.array(z.string()),
  risk: ActionRiskSchema,
  status: ActionStatusSchema,
  confirmation: z.string().nullable(),
});
export type MoveAction = z.infer<typeof MoveActionSchema>;

export const DecisionRequestSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    setupDate: z.string().date(),
    monthlyCost: z.number().nonnegative(),
    setupCost: z.number().nonnegative(),
    consequence: z.string().min(1),
  })).min(2),
  selectedOption: z.string().nullable(),
  approvalToken: z.string().nullable(),
});
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

export const JurisdictionPackSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  country: z.string().length(2),
  region: z.string().min(1),
  addressFormat: z.string().min(1),
  supportedServices: z.array(ServiceKindSchema),
  rules: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    classification: z.enum(['required', 'recommended', 'provider-specific']),
    humanIdentityRequired: z.boolean(),
    sourceUrl: z.string().url(),
    checkedAt: z.string().date(),
  })),
});
export type JurisdictionPack = z.infer<typeof JurisdictionPackSchema>;

export const MoveReceiptSchema = z.object({
  schemaVersion: z.literal('moving-day.receipt.v1'),
  caseId: z.string(),
  generatedAt: z.string().datetime(),
  jurisdictionPack: z.string(),
  discoveredServices: z.number().int().nonnegative(),
  executedActions: z.number().int().nonnegative(),
  verifiedActions: z.number().int().nonnegative(),
  failedActions: z.number().int().nonnegative(),
  blockedActions: z.number().int().nonnegative(),
  serviceGaps: z.number().int().nonnegative(),
  decisions: z.array(z.object({ id: z.string(), selectedOption: z.string() })),
  confirmations: z.array(z.object({ actionId: z.string(), confirmation: z.string() })),
});
export type MoveReceipt = z.infer<typeof MoveReceiptSchema>;

export interface MoveState {
  moveCase: MoveCase;
  accounts: ProviderAccount[];
  actions: MoveAction[];
  decisions: DecisionRequest[];
  receipt: MoveReceipt | null;
  physicalProfile: PhysicalMoveProfile;
  moveEstimate: MoveEstimate;
}

export { floridaJurisdictionPack } from './florida.js';
export * from './routing.js';
export * from './volume.js';
