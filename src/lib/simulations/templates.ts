import { z } from "zod";

export const simulationTemplateSchema = z.object({
  id: z.enum(["browser-assistant", "contact-center", "drive-thru", "customer-support", "tool-using-agent", "blank"]),
  name: z.string().min(1),
  stages: z.array(z.enum(["audio", "stt", "conversation", "agent", "tool", "tts", "playback", "outcome"])).min(1),
  provenance: z.literal("simulated"),
}).strict();

export const SIMULATION_TEMPLATES = [
  { id: "browser-assistant", name: "Browser Voice Assistant", stages: ["audio", "stt", "conversation", "agent", "tts", "playback", "outcome"], provenance: "simulated" },
  { id: "contact-center", name: "Contact Center Agent", stages: ["audio", "stt", "conversation", "agent", "tool", "tts", "playback", "outcome"], provenance: "simulated" },
  { id: "drive-thru", name: "Drive-Thru Voice Agent", stages: ["audio", "stt", "conversation", "agent", "tool", "tts", "playback", "outcome"], provenance: "simulated" },
  { id: "customer-support", name: "Customer Support Assistant", stages: ["audio", "stt", "conversation", "agent", "tool", "tts", "playback", "outcome"], provenance: "simulated" },
  { id: "tool-using-agent", name: "Tool-Using Voice Agent", stages: ["audio", "stt", "conversation", "agent", "tool", "tts", "playback", "outcome"], provenance: "simulated" },
  { id: "blank", name: "Blank Experiment", stages: ["audio", "outcome"], provenance: "simulated" },
].map((template) => simulationTemplateSchema.parse(template));

export type SimulationTemplateId = (typeof SIMULATION_TEMPLATES)[number]["id"];
