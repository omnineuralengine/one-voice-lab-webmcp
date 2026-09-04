import { z } from "zod";

import {
  ONE_PUBLIC_LAB_DESTINATION_IDS,
} from "@/lib/public-evidence/lab-destinations";
import {
  normalizedProviderCapabilityIdSchema,
  providerCapabilityFamilySchema,
  providerCapabilityVerificationSchema,
  providerCatalogGroupSchema,
  providerCatalogIdSchema,
  providerEntityKindSchema,
  providerIntegrationPathSchema,
} from "@/lib/providers/platform-types";

export const ONE_WEBMCP_TOOL_NAMES = [
  "get_one_lab_map",
  "get_current_one_context",
  "find_voice_providers",
  "compare_voice_providers",
  "open_one_lab",
] as const;

export const ONE_LAB_MAP_GOALS = [
  "orient",
  "discover-providers",
  "compare-providers",
  "evaluate-customer-support-voice-agent",
  "prepare-telephony-readiness",
] as const;

export const ONE_PROVIDER_COMPARISON_DIMENSIONS = [
  "identity",
  "capabilities",
  "evidence",
  "integration",
  "benchmark-eligibility",
] as const;

export const ONE_PROVIDER_SEARCH_MAX_RESULTS = 20;

export const getOneLabMapInputSchema = z.object({
  goal: z.enum(ONE_LAB_MAP_GOALS).optional(),
}).strict();

export const getCurrentOneContextInputSchema = z.object({}).strict();

export const findVoiceProvidersInputSchema = z.object({
  query: z.string().trim().min(1).max(80).optional(),
  group: providerCatalogGroupSchema.optional(),
  kind: providerEntityKindSchema.optional(),
  capabilityFamily: providerCapabilityFamilySchema.optional(),
  supportedCapability: normalizedProviderCapabilityIdSchema.optional(),
  integrationType: providerIntegrationPathSchema.optional(),
  evidenceRequirement: providerCapabilityVerificationSchema.optional(),
  maxResults: z.number().int().min(1).max(ONE_PROVIDER_SEARCH_MAX_RESULTS).default(10),
}).strict();

const uniqueProviderIdsSchema = z.array(providerCatalogIdSchema).min(2).max(3).superRefine(
  (providerIds, context) => {
    if (new Set(providerIds).size !== providerIds.length) {
      context.addIssue({ code: "custom", message: "Choose two or three unique provider identifiers." });
    }
  },
);

const uniqueComparisonDimensionsSchema = z
  .array(z.enum(ONE_PROVIDER_COMPARISON_DIMENSIONS))
  .min(1)
  .max(ONE_PROVIDER_COMPARISON_DIMENSIONS.length)
  .superRefine((dimensions, context) => {
    if (new Set(dimensions).size !== dimensions.length) {
      context.addIssue({ code: "custom", message: "Choose each comparison dimension at most once." });
    }
  });

export const compareVoiceProvidersInputSchema = z.object({
  providerIds: uniqueProviderIdsSchema,
  dimensions: uniqueComparisonDimensionsSchema,
}).strict();

export const openOneLabInputSchema = z.object({
  routeId: z.enum(ONE_PUBLIC_LAB_DESTINATION_IDS),
}).strict();

export type OneWebMcpToolName = (typeof ONE_WEBMCP_TOOL_NAMES)[number];
export type OneLabMapGoal = (typeof ONE_LAB_MAP_GOALS)[number];
export type OneProviderComparisonDimension =
  (typeof ONE_PROVIDER_COMPARISON_DIMENSIONS)[number];
export type GetOneLabMapInput = z.infer<typeof getOneLabMapInputSchema>;
export type FindVoiceProvidersInput = z.infer<typeof findVoiceProvidersInputSchema>;
export type CompareVoiceProvidersInput = z.infer<typeof compareVoiceProvidersInputSchema>;
export type OpenOneLabInput = z.infer<typeof openOneLabInputSchema>;
