import "server-only";

import type {
  BenchmarkReadPrincipal,
  BenchmarkReadRepository,
} from "@/lib/evaluation/benchmark-read-service";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseRpcClient = Readonly<{
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<Readonly<{ data: unknown; error: unknown }>>;
}>;

export function createSupabaseBenchmarkReadRepository(
  client: SupabaseRpcClient,
): BenchmarkReadRepository {
  return {
    async readPrivateResult(runId: string, principal: BenchmarkReadPrincipal) {
      const response = await client.rpc("read_benchmark_result", {
        p_run_id: runId,
        p_guard_token: principal.guardToken,
      });
      if (response.error) throw new Error("Benchmark result storage is unavailable.");
      return response.data;
    },
    async listPublicSnapshots(input) {
      const response = await client.rpc("list_public_benchmark_snapshots", {
        p_suite_key: input.suiteId ?? null,
        p_limit: input.limit,
        p_before_as_of: input.before?.asOfAt ?? null,
        p_before_id: input.before?.snapshotId ?? null,
      });
      if (response.error) throw new Error("Public benchmark storage is unavailable.");
      return response.data;
    },
  };
}

export async function getPublicBenchmarkReadRepository(): Promise<BenchmarkReadRepository | null> {
  const client = await getOneSupabaseServerClient();
  return client ? createSupabaseBenchmarkReadRepository(client) : null;
}
