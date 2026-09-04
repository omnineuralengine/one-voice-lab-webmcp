import { z } from "zod";

import { DEFAULT_SIMULATION_SCENARIO_ID } from "@/lib/simulations/registry";
import { simulationTemplateSchema } from "@/lib/simulations/templates";

export const VOICE_REPLAY_WEBMCP_TOOL_NAMES = [
  "list_voice_scenarios",
  "prepare_voice_replay",
  "run_voice_replay",
  "get_voice_replay_evidence",
] as const;

export type VoiceReplayWebMcpToolName =
  (typeof VOICE_REPLAY_WEBMCP_TOOL_NAMES)[number];

export const VOICE_REPLAY_IMPAIRMENTS = [
  "none",
  "background-noise",
  "crosstalk",
  "tool-latency",
  "network-reconnect",
] as const;

export const TWILIO_CONVERSATION_RELAY_PROFILE_ID =
  "twilio-conversationrelay-production-readiness" as const;

export const listVoiceScenariosInputSchema = z.object({}).strict();

export const prepareVoiceReplayInputSchema = z.object({
  scenarioId: z.literal(DEFAULT_SIMULATION_SCENARIO_ID),
  templateId: simulationTemplateSchema.shape.id,
  impairment: z.enum(VOICE_REPLAY_IMPAIRMENTS),
  runCount: z.number().int().min(1).max(3),
  referenceProfileId: z.literal(TWILIO_CONVERSATION_RELAY_PROFILE_ID).optional(),
}).strict();

export const runVoiceReplayInputSchema = z.object({
  planId: z.string().regex(/^voice-replay-plan-[1-9][0-9]*-[a-f0-9]{8}$/),
}).strict();

export const getVoiceReplayEvidenceInputSchema = z.object({}).strict();

export type PrepareVoiceReplayInput = z.infer<typeof prepareVoiceReplayInputSchema>;
export type RunVoiceReplayInput = z.infer<typeof runVoiceReplayInputSchema>;
