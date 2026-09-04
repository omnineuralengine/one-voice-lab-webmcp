"use client";

import { useState } from "react";

import { useVoiceLabActions } from "@/components/actions/VoiceLabActionProvider";
import { useRegisterVoiceLabAction } from "@/components/actions/useRegisterVoiceLabAction";
import { requestSyntheticEvaluationAction } from "@/lib/actions/public-client";
import type { PublicSyntheticEvalResult } from "@/lib/public-evidence/schemas";

export function SyntheticEvalRunner({ evalId }: { evalId: string }) {
  const { dispatch } = useVoiceLabActions();
  const [status, setStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [result, setResult] = useState<PublicSyntheticEvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useRegisterVoiceLabAction("publicEvaluation.runSynthetic", (input, context) => (
    requestSyntheticEvaluationAction(input, context.signal)
  ), {
    isAvailable: () => status !== "running",
    unavailableMessage: "The synthetic evaluation is already running.",
  });

  async function runEvaluation() {
    setStatus("running");
    setError(null);
    setResult(null);

    const actionResult = await dispatch("publicEvaluation.runSynthetic", { evalId }, { source: "ui" });
    if (actionResult.ok) {
      setResult(actionResult.data.result);
      setStatus("complete");
    } else {
      setError(actionResult.error.message);
      setStatus("error");
    }
  }

  return (
    <div data-agent-action="voice-lab.run-synthetic-eval" data-voice-action="publicEvaluation.runSynthetic">
      <button
        className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300/30 bg-emerald-300/[0.08] px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/50 hover:bg-emerald-300/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
        disabled={status === "running"}
        onClick={runEvaluation}
        type="button"
      >
        {status === "running" ? "Running local fixture…" : "Run nonbillable synthetic evaluation"}
      </button>

      <div aria-atomic="true" aria-label="Synthetic evaluation result status" aria-live="polite" className="mt-3 text-sm text-slate-300" role="status">
        {status === "idle" ? "Ready. This action makes no provider call." : null}
        {status === "running" ? "Running the deterministic repository fixture locally." : null}
        {status === "complete" && result
          ? `Complete: ${result.passed ? "all deterministic assertions passed" : "one or more assertions failed"}. Evidence: simulated.`
          : null}
        {status === "error" ? error : null}
      </div>

      {result ? (
        <section aria-labelledby={`result-${evalId}`} className="mt-4 rounded-xl border border-emerald-300/20 bg-black/20 p-4">
          <h3 className="text-base font-semibold text-white" id={`result-${evalId}`}>Structured result</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Evaluation ID</dt><dd className="font-mono text-slate-100">{result.evalId}</dd></div>
            <div><dt className="text-slate-500">Fixture hash</dt><dd className="font-mono text-slate-100">{result.fixtureHash}</dd></div>
            <div><dt className="text-slate-500">Evidence</dt><dd className="text-slate-100">Simulated</dd></div>
            <div><dt className="text-slate-500">Human review</dt><dd className="text-slate-100">{result.humanReviewRequired ? "Required for marked criteria" : "Not marked"}</dd></div>
          </dl>
          <ul aria-label="Assertion results" className="mt-4 space-y-2">
            {result.assertionResults.map((assertion) => (
              <li className="rounded-lg border border-white/10 p-3 text-sm text-slate-300" key={assertion.id}>
                <strong className="text-white">{assertion.passed ? "Pass" : "Fail"}: {assertion.id}</strong>
                <p className="mt-1">{assertion.actual}</p>
                {assertion.requiresHumanReview ? <p className="mt-1 text-amber-200">Human review required.</p> : null}
              </li>
            ))}
          </ul>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200">Read result JSON</summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-slate-300" tabIndex={0}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
