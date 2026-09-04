import type { ProviderCapability } from "@/lib/providers/types";

export type ProviderAdapterErrorCode =
  | "provider_unknown"
  | "provider_not_implemented"
  | "provider_capability_unavailable"
  | "provider_execution_disabled";

export type ProviderOperationErrorCode =
  | "provider_not_configured"
  | "provider_demo_only"
  | "invalid_request"
  | "input_too_large"
  | "unsupported_media_type"
  | "provider_unauthorized"
  | "provider_forbidden"
  | "provider_rate_limited"
  | "provider_quota_exhausted"
  | "provider_budget_exhausted"
  | "provider_access_unavailable"
  | "provider_concurrency_limited"
  | "provider_failure"
  | "provider_timeout"
  | "provider_malformed_response"
  | "request_in_flight";

export class ProviderAdapterError extends Error {
  readonly code: ProviderAdapterErrorCode;
  readonly status: number;
  readonly providerId?: string;
  readonly capability?: ProviderCapability;

  constructor(input: {
    code: ProviderAdapterErrorCode;
    message: string;
    status: number;
    providerId?: string;
    capability?: ProviderCapability;
  }) {
    super(input.message);
    this.name = "ProviderAdapterError";
    this.code = input.code;
    this.status = input.status;
    this.providerId = input.providerId;
    this.capability = input.capability;
  }
}

export class ProviderOperationError extends Error {
  readonly code: ProviderOperationErrorCode;
  readonly status: number;
  readonly providerId: string;
  readonly operation: string;
  readonly upstreamStatus?: number;

  constructor(input: {
    code: ProviderOperationErrorCode;
    message: string;
    status: number;
    providerId: string;
    operation: string;
    upstreamStatus?: number;
  }) {
    super(input.message);
    this.name = "ProviderOperationError";
    this.code = input.code;
    this.status = input.status;
    this.providerId = input.providerId;
    this.operation = input.operation;
    this.upstreamStatus = input.upstreamStatus;
  }
}
