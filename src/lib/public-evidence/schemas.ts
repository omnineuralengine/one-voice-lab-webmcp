import { z } from "zod";

import {
  providerIdSchema,
  providerCapabilitySchema,
  providerStatusSchema,
} from "@/lib/providers/types";
import {
  providerCatalogIdSchema,
  providerPlatformProjectionSchema,
} from "@/lib/providers/platform-types";

export const PUBLIC_SCHEMA_VERSION = "1.0.0";
export const PUBLIC_REGISTRY_LAST_VERIFIED_AT = "2026-08-19";

export const publicEvidenceTypeSchema = z.enum([
  "repository_verified",
  "provider_documentation_verified",
  "manual_verification_required",
  "no_implementation_evidence",
  "simulated",
  "measured",
  "assumption",
  "experimental",
]);

export const publicEvidenceLabelSchema = z.enum([
  "Repository verified",
  "Provider documentation verified",
  "Manual verification required",
  "No implementation evidence",
]);

export const publicProviderSupportStateSchema = z.enum([
  "Repository verified",
  "Provider documentation verified",
  "Verification required",
  "Not supported",
]);

export const publicProviderStateSchema = z.object({
  listed: z.literal(true),
  configured: z.boolean(),
  adapterBacked: z.boolean(),
  liveEnabled: z.boolean(),
  docsVerified: z.boolean(),
  repositoryVerified: z.boolean(),
  experimental: z.boolean(),
}).strict();

export const publicProviderCapabilitySchema = z.object({
  id: providerCapabilitySchema,
  providerSupport: publicProviderSupportStateSchema,
  labImplementation: providerStatusSchema,
  evidence: publicEvidenceLabelSchema,
  adapterBacked: z.boolean(),
  liveEnabled: z.boolean(),
  providerTerm: z.string().min(1).optional(),
}).strict();

export const publicProviderModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  href: z.string().startsWith("/"),
  capabilities: z.array(providerCapabilitySchema),
}).strict();

export const publicProviderSchema = z.object({
  id: providerCatalogIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  status: providerStatusSchema,
  url: z.string().url(),
  states: publicProviderStateSchema,
  capabilities: z.array(publicProviderCapabilitySchema),
  modules: z.array(publicProviderModuleSchema),
  evidence: publicEvidenceLabelSchema,
  evidenceType: publicEvidenceTypeSchema,
  documentationStatus: z.string().min(1),
  limitations: z.array(z.string().min(1)),
  lastVerifiedAt: z.string().date().optional(),
  sourceUrls: z.array(z.string().url()),
  platform: providerPlatformProjectionSchema,
}).strict();

export const publicEvalStatusSchema = z.enum([
  "implemented_with_deterministic_fixture",
  "planned",
]);

export const publicEvalSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  status: publicEvalStatusSchema,
  hypothesis: z.string().min(1),
  fixture: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    hash: z.string().regex(/^fnv1a32:[a-f0-9]{8}$/),
    input: z.string().min(1),
    kind: z.literal("deterministic_local_simulation"),
  }).strict(),
  task: z.array(z.string().min(1)),
  eligibleProviderIds: z.array(providerIdSchema),
  providerConfiguration: z.array(z.object({
    providerId: providerIdSchema,
    model: z.string().min(1).optional(),
    settings: z.record(z.string(), z.unknown()),
  }).strict()),
  environment: z.object({
    execution: z.literal("local_deterministic"),
    providerCalls: z.literal(false),
    billable: z.literal(false),
  }).strict(),
  measuredMetrics: z.array(z.object({
    id: z.string().min(1),
    value: z.number(),
    unit: z.string().min(1),
  }).strict()),
  qualitativeReviewCriteria: z.array(z.object({
    id: z.string().min(1),
    dimension: z.string().min(1),
    expected: z.string().min(1),
    deterministicRule: z.string().min(1),
    requiresHumanReview: z.boolean(),
  }).strict()),
  limitations: z.array(z.string().min(1)),
  evidenceType: publicEvidenceTypeSchema,
  evidenceLabel: z.string().min(1),
  lastRunAt: z.string().datetime().optional(),
  lastVerifiedAt: z.string().date(),
  provenanceSourceUrls: z.array(z.string().url()),
}).strict();

export const publicSyntheticEvalResultSchema = z.object({
  id: z.string().min(1),
  evalId: z.string().min(1),
  fixtureHash: z.string().regex(/^fnv1a32:[a-f0-9]{8}$/),
  executedAt: z.string().datetime(),
  passed: z.boolean(),
  assertionResults: z.array(z.object({
    id: z.string().min(1),
    dimension: z.string().min(1),
    expected: z.string().min(1),
    actual: z.string().min(1),
    passed: z.boolean(),
    requiresHumanReview: z.boolean(),
  }).strict()),
  expectedBehavior: z.array(z.string().min(1)),
  actualBehavior: z.array(z.string().min(1)),
  trace: z.object({
    id: z.string().min(1),
    eventCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    provenance: z.literal("simulated"),
    rawAudioIncluded: z.literal(false),
  }).strict(),
  evidenceType: z.literal("simulated"),
  humanReviewRequired: z.boolean(),
  limitations: z.array(z.string().min(1)),
}).strict();

export const publicMethodologySchema = z.object({
  id: z.literal("voice-lab-evaluation-methodology-v1"),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.literal("1.1.0"),
  url: z.string().url(),
  principles: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    explanation: z.string().min(1),
  }).strict()),
  evidenceVocabulary: z.array(z.object({
    id: publicEvidenceTypeSchema,
    label: z.string().min(1),
    meaning: z.string().min(1),
  }).strict()),
  safetyConstraints: z.array(z.string().min(1)),
  lastVerifiedAt: z.string().date(),
}).strict();

export function createPublicEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
    generatedAt: z.string().datetime(),
    canonicalUrl: z.string().url(),
    evidenceType: publicEvidenceTypeSchema,
    lastVerifiedAt: z.string().date(),
    data: dataSchema,
  }).strict();
}

export const publicErrorSchema = z.object({
  schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }).strict(),
}).strict();

export type PublicEvidenceType = z.infer<typeof publicEvidenceTypeSchema>;
export type PublicProvider = z.infer<typeof publicProviderSchema>;
export type PublicEval = z.infer<typeof publicEvalSchema>;
export type PublicSyntheticEvalResult = z.infer<typeof publicSyntheticEvalResultSchema>;
export type PublicMethodology = z.infer<typeof publicMethodologySchema>;
