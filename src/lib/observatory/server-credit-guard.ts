import "server-only";

type GuardState = { active: boolean; operation?: string; startedAt?: number };
const globalKey = "__deepgram_observatory_credit_guard_v1__";

function state() {
  const target = globalThis as typeof globalThis & Record<string, unknown>;
  if (!target[globalKey]) target[globalKey] = { active: false } satisfies GuardState;
  return target[globalKey] as GuardState;
}

export async function withObservatoryServerGuard<T>(operation: string, task: () => Promise<T>) {
  const guard = state();
  if (guard.active) throw new ObservatoryConcurrencyError(`Another Observatory operation (${guard.operation || "unknown"}) is already active.`);
  guard.active = true;
  guard.operation = operation;
  guard.startedAt = Date.now();
  try { return await task(); }
  finally { guard.active = false; guard.operation = undefined; guard.startedAt = undefined; }
}

export class ObservatoryConcurrencyError extends Error {
  status = 409;
  constructor(message: string) { super(message); this.name = "ObservatoryConcurrencyError"; }
}
