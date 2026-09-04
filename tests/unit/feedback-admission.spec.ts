import { expect, test } from "@playwright/test";

import { isFeedbackAdmissionLimit } from "@/lib/feedback/rpc-error";

test("classifies only the database's stable feedback admission denials as rate limits", () => {
  expect(isFeedbackAdmissionLimit({ code: "P0001", message: "feedback_global_limit" })).toBe(true);
  expect(isFeedbackAdmissionLimit({ code: "P0001", message: "feedback_user_limit" })).toBe(true);

  expect(isFeedbackAdmissionLimit({ code: "42501", message: "feedback_user_limit" })).toBe(false);
  expect(isFeedbackAdmissionLimit({ code: "P0001", message: "unexpected database failure" })).toBe(false);
  expect(isFeedbackAdmissionLimit(null)).toBe(false);
});

test("unexpected database details cannot be promoted into a client-visible rate-limit response", () => {
  const error = {
    code: "P0001",
    message: "Authorization: Bearer provider-secret",
  };

  expect(isFeedbackAdmissionLimit(error)).toBe(false);
  expect(JSON.stringify({ code: "feedback_unavailable" })).not.toContain(error.message);
});
