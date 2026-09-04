"use client";

import { useState } from "react";

import { requestAiUsage } from "@/lib/ai/client";

type Usage = Awaited<ReturnType<typeof requestAiUsage>>;

export function AiUsageObservatory() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  async function refresh() { try { setUsage(await requestAiUsage()); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Usage metadata unavailable."); } }
  return <section className="rounded-xl border border-white/10 bg-[#071016] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">This browser session</h2><p className="mt-1 text-xs text-slate-400">Ephemeral metadata only. No prompt, transcript, payload, key, or generated content is recorded here.</p></div><button type="button" onClick={() => void refresh()} className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-200">{usage ? "Refresh" : "Load metadata"}</button></div>{error ? <p role="alert" className="mt-4 text-xs text-amber-100">{error}</p> : null}{usage ? <><p className="mt-3 text-[10px] text-slate-500">Storage: {usage.persistence}</p>{usage.entries.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="p-2">Time</th><th className="p-2">Feature</th><th className="p-2">Class / model</th><th className="p-2">Latency</th><th className="p-2">Tokens</th><th className="p-2">Cost</th><th className="p-2">Result</th></tr></thead><tbody>{usage.entries.slice().reverse().map((entry, index) => <tr key={`${entry.timestamp}:${entry.feature}:${index}`} className="border-t border-white/8"><td className="p-2 text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</td><td className="p-2 text-white">{entry.feature}</td><td className="p-2 text-slate-300">{entry.reasoningClass}<span className="block text-[10px] text-slate-500">{entry.model}</span></td><td className="p-2 text-slate-400">{entry.latencyMs} ms</td><td className="p-2 text-slate-400">{entry.inputTokens ?? "?"} / {entry.outputTokens ?? "?"}</td><td className="p-2 text-slate-400">{entry.costUsd === null ? "not returned" : `$${entry.costUsd.toFixed(6)}`}</td><td className="p-2">{entry.success ? "Success" : "Unavailable"}{entry.fallbackUsed ? " · fallback" : ""}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-xs text-slate-500">No AI requests have completed in this anonymous session.</p>}</> : null}</section>;
}
