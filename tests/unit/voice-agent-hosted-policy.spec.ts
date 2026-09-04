import { expect, test } from "@playwright/test";

import { DEEPGRAM_ENDPOINT_REGISTRY, getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";
import { buildPocketApiHandoffs, buildPocketApiRequestExample, getPocketApiAvailabilityNote } from "@/lib/pocket-api-lab";

const HOSTED_DISABLED_REASON = "Hosted temporary-token issuance is disabled. This flow is available for documentation or local/manual inspection only; no live session can be started here.";

test("projects the permanent hosted Voice Agent boundary through typed endpoint metadata", () => {
  const endpoint = getDeepgramEndpoint("voice-agent-converse");

  expect(endpoint).toBeDefined();
  expect(endpoint?.hostedExecution).toEqual({
    state: "unavailable",
    label: "Hosted execution unavailable",
    reason: HOSTED_DISABLED_REASON,
  });
  expect(DEEPGRAM_ENDPOINT_REGISTRY.filter((item) => item.hostedExecution)).toEqual([endpoint]);
});

test("keeps the Voice Agent entry inspectable without making Pocket execution runnable", () => {
  const endpoint = getDeepgramEndpoint("voice-agent-converse");
  if (!endpoint) throw new Error("Missing Voice Agent endpoint fixture.");

  expect(buildPocketApiRequestExample(endpoint).executable).toBe(false);
  expect(buildPocketApiHandoffs(endpoint).apiLab).toBe("/?module=api-studio&operation=voice-agent-converse&source=pocket-api-lab");
  const configuredOpenLabNote = getPocketApiAvailabilityNote(endpoint, { openLabMode: true, apiConfigured: true });
  expect(configuredOpenLabNote).toContain("Hosted Voice Agent execution is disabled");
  expect(configuredOpenLabNote).not.toMatch(/ready|available for live|shared live project/i);
});
