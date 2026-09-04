import "server-only";

import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Scenario digest input must contain only finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => {
          if (record[key] === undefined) {
            throw new TypeError("Scenario digest input cannot contain undefined values.");
          }
          return [key, canonicalize(record[key])];
        }),
    );
  }
  throw new TypeError("Scenario digest input must be JSON-compatible.");
}

export function canonicalScenarioJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createScenarioDigest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalScenarioJson(value), "utf8").digest("hex")}`;
}
