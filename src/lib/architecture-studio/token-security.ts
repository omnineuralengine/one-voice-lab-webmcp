import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export function hashStudioToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
export function studioTokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashStudioToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
