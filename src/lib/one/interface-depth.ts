import { z } from "zod";

export const INTERFACE_DEPTHS = [
  {
    id: "essential",
    label: "Essential",
    description: "Show the purpose, next action, outcome, and important limits.",
  },
  {
    id: "guided",
    label: "Guided",
    description: "Add short explanations where a concept becomes useful.",
  },
  {
    id: "detailed",
    label: "Detailed",
    description: "Include provider, model, configuration, measurements, and limitations.",
  },
  {
    id: "technical",
    label: "Technical",
    description: "Include stable IDs, methodology, traces, and sanitized raw evidence.",
  },
] as const;

export const interfaceDepthSchema = z.enum([
  "essential",
  "guided",
  "detailed",
  "technical",
]);

export type InterfaceDepth = z.infer<typeof interfaceDepthSchema>;

export const DEFAULT_INTERFACE_DEPTH: InterfaceDepth = "guided";
export const ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY = "one:guest:interface-depth:v1";

const storedInterfaceDepthSchema = z.object({
  schemaVersion: z.literal("one-interface-depth/1.0.0"),
  depth: interfaceDepthSchema,
}).strict();

const DEPTH_INDEX = new Map<InterfaceDepth, number>(
  INTERFACE_DEPTHS.map((item, index) => [item.id, index]),
);

export function depthIncludes(current: InterfaceDepth, minimum: InterfaceDepth) {
  return (DEPTH_INDEX.get(current) ?? 0) >= (DEPTH_INDEX.get(minimum) ?? 0);
}

export function serializeInterfaceDepth(depth: InterfaceDepth) {
  return JSON.stringify({
    schemaVersion: "one-interface-depth/1.0.0",
    depth: interfaceDepthSchema.parse(depth),
  });
}

export function createInterfaceDepthWriteQueue() {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(write: () => Promise<T>) {
      const result = tail.then(write, write);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export function parseStoredInterfaceDepth(value: string | null): InterfaceDepth | null {
  if (!value || value.length > 256) return null;
  try {
    const parsed = storedInterfaceDepthSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data.depth : null;
  } catch {
    return null;
  }
}

export function parseAccountInterfaceDepth(value: unknown): InterfaceDepth {
  const parsed = interfaceDepthSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_INTERFACE_DEPTH;
}
