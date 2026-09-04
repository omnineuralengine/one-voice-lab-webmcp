import "server-only";

export const RESON8_CREDENTIAL_ENVIRONMENT_NAME = "RESON8_API_KEY" as const;

/**
 * A closure-backed credential that can authorize a server request without
 * making the secret a serializable property of the value passed around.
 */
export type Reson8ServerCredential = Readonly<{
  state: "present";
  authorize(headers?: HeadersInit): Headers;
  assertAbsentFrom(value: string): void;
}>;

export function readReson8ServerCredential(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Reson8ServerCredential | null {
  const secret = environment[RESON8_CREDENTIAL_ENVIRONMENT_NAME]?.trim();
  if (!secret) return null;

  return Object.freeze({
    state: "present" as const,
    authorize(headersInit?: HeadersInit): Headers {
      const headers = new Headers(headersInit);
      if (headers.has("authorization")) {
        throw new Error("The Reson8 authorization header must be owned by the server transport.");
      }
      headers.set("authorization", `ApiKey ${secret}`);
      return headers;
    },
    assertAbsentFrom(value: string): void {
      if (value.includes(secret)) {
        throw new Error("The Reson8 credential reached a serializable value.");
      }
    },
  });
}
