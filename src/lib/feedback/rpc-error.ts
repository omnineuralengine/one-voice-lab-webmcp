export type FeedbackRpcError = Readonly<{
  code?: string | null;
  message?: string | null;
}>;

const ADMISSION_LIMIT_MESSAGES = new Set([
  "feedback_global_limit",
  "feedback_user_limit",
]);

export function isFeedbackAdmissionLimit(error: FeedbackRpcError | null | undefined): boolean {
  return error?.code === "P0001"
    && typeof error.message === "string"
    && ADMISSION_LIMIT_MESSAGES.has(error.message);
}
