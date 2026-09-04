import "server-only";

import {
  benchmarkPrivateResultProjectionSchema,
  benchmarkPublicSnapshotListInputSchema,
  benchmarkPublicSnapshotListSchema,
  benchmarkRetrieveResultInputSchema,
  type BenchmarkPrivateResultProjection,
  type BenchmarkPublicSnapshotList,
  type BenchmarkPublicSnapshotListInput,
} from "@/lib/evaluation/benchmark-read-schema";

export type BenchmarkReadPrincipal = Readonly<{
  userId: string;
  guardToken: string;
}>;

export interface BenchmarkReadRepository {
  readPrivateResult(runId: string, principal: BenchmarkReadPrincipal): Promise<unknown | null>;
  listPublicSnapshots(input: Readonly<{
    suiteId?: string;
    limit: number;
    before?: Readonly<{ asOfAt: string; snapshotId: string }>;
  }>): Promise<unknown>;
}

export class BenchmarkReadServiceError extends Error {
  constructor(
    readonly code: "authentication_required" | "invalid_request" | "invalid_projection",
    message: string,
  ) {
    super(message);
    this.name = "BenchmarkReadServiceError";
  }
}

export async function retrieveBenchmarkResult(
  input: unknown,
  dependencies: Readonly<{ repository: BenchmarkReadRepository; principal: BenchmarkReadPrincipal | null }>,
): Promise<Readonly<{ result: BenchmarkPrivateResultProjection | null }>> {
  const parsed = benchmarkRetrieveResultInputSchema.safeParse(input);
  if (!parsed.success) throw new BenchmarkReadServiceError("invalid_request", "A valid benchmark run ID is required.");
  if (!dependencies.principal?.userId || !dependencies.principal.guardToken) {
    throw new BenchmarkReadServiceError("authentication_required", "An authenticated member session is required.");
  }
  const raw = await dependencies.repository.readPrivateResult(parsed.data.runId, dependencies.principal);
  if (raw === null) return { result: null };
  const result = benchmarkPrivateResultProjectionSchema.safeParse(raw);
  if (!result.success) throw new BenchmarkReadServiceError("invalid_projection", "The benchmark repository returned an invalid private result projection.");
  return { result: result.data };
}

export async function listBenchmarkLeaderboardSnapshots(
  input: BenchmarkPublicSnapshotListInput,
  dependencies: Readonly<{ repository: BenchmarkReadRepository }>,
): Promise<BenchmarkPublicSnapshotList> {
  const parsed = benchmarkPublicSnapshotListInputSchema.safeParse(input);
  if (!parsed.success) throw new BenchmarkReadServiceError("invalid_request", "The public benchmark listing request is invalid.");
  const raw = await dependencies.repository.listPublicSnapshots(parsed.data);
  const result = benchmarkPublicSnapshotListSchema.safeParse(raw);
  if (!result.success) throw new BenchmarkReadServiceError("invalid_projection", "The benchmark repository returned an invalid public list projection.");
  return result.data;
}
