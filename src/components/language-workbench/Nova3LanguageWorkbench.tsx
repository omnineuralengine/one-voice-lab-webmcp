"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  DEEPGRAM_LANGUAGE_LAST_VERIFIED_AT,
  getDeepgramNova3LanguageOption,
  type DeepgramLanguageOption,
  type DeepgramNova3LanguageCode,
} from "@/lib/deepgram-languages";
import {
  LANGUAGE_LAST_APPLIED_STORAGE_KEY,
  LANGUAGE_RECENT_STORAGE_KEY,
  addRecentLanguage,
  canUseSampleInTts,
  languageBaseOption,
  languageCaveats,
  languageRecommendedUses,
  languageRegionLabel,
  languageWorkbenchSnippets,
  relatedRegionalVariants,
  reviewedSampleForLanguage,
  sanitizeLastAppliedLanguage,
  sanitizeRecentLanguages,
  searchNova3Languages,
  type LanguageHandoffDestination,
  type LanguageLastAppliedRecord,
  type LanguageRecentRecord,
} from "@/lib/language-workbench";

type Nova3LanguageWorkbenchProps = {
  language: DeepgramNova3LanguageCode | null;
  hostedReviewMode: boolean;
  onLanguageChange: (language: DeepgramNova3LanguageCode) => void;
  onApply: (destination: LanguageHandoffDestination, language: DeepgramNova3LanguageCode) => boolean;
  onUseSampleInTts: (language: DeepgramNova3LanguageCode, text: string) => boolean;
};

export function Nova3LanguageWorkbench({ language, hostedReviewMode, onLanguageChange, onApply, onUseSampleInTts }: Nova3LanguageWorkbenchProps) {
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [recent, setRecent] = useState<LanguageRecentRecord[]>([]);
  const [lastApplied, setLastApplied] = useState<LanguageLastAppliedRecord | null>(null);
  const [copied, setCopied] = useState("");
  const [feedback, setFeedback] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = language ? getDeepgramNova3LanguageOption(language) ?? null : null;
  const filtered = useMemo(() => searchNova3Languages(search), [search]);
  const recentOptions = useMemo(() => recent.flatMap((record) => {
    const option = getDeepgramNova3LanguageOption(record.code);
    return option && filtered.some((candidate) => candidate.code === option.code) ? [option] : [];
  }), [filtered, recent]);
  const recentCodes = useMemo(() => new Set(recentOptions.map((option) => option.code)), [recentOptions]);
  const regional = useMemo(() => filtered.filter((option) => option.code.includes("-") && !recentCodes.has(option.code)), [filtered, recentCodes]);
  const multilingual = useMemo(() => filtered.filter((option) => option.code === "multi" && !recentCodes.has(option.code)), [filtered, recentCodes]);
  const baseLanguages = useMemo(() => filtered.filter((option) => option.code !== "multi" && !option.code.includes("-") && !recentCodes.has(option.code)), [filtered, recentCodes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecent(readRecentLanguages());
      setLastApplied(readLastApplied());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectLanguage(code: DeepgramNova3LanguageCode) {
    onLanguageChange(code);
    const next = addRecentLanguage(recent, code, new Date().toISOString());
    setRecent(next);
    window.localStorage.setItem(LANGUAGE_RECENT_STORAGE_KEY, JSON.stringify(next));
    setFeedback(`${getDeepgramNova3LanguageOption(code)?.name ?? code} selected. No request was run.`);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!filtered.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => (current + direction + filtered.length) % filtered.length);
    } else if (event.key === "Enter" && filtered[highlightedIndex]) {
      event.preventDefault();
      selectLanguage(filtered[highlightedIndex].code as DeepgramNova3LanguageCode);
    } else if (event.key === "Escape" && search) {
      event.preventDefault();
      setSearch("");
    }
  }

  async function copySnippet(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setFeedback(`${label} copied.`);
      window.setTimeout(() => setCopied((current) => current === label ? "" : current), 1400);
    } catch {
      setCopied("");
      setFeedback("Copy failed. Select the text manually.");
    }
  }

  function apply(destination: LanguageHandoffDestination) {
    if (!selected || !onApply(destination, selected.code as DeepgramNova3LanguageCode)) {
      setFeedback("The target module could not accept this language configuration.");
      return;
    }
    const record: LanguageLastAppliedRecord = { code: selected.code as DeepgramNova3LanguageCode, destination, usedAt: new Date().toISOString() };
    window.localStorage.setItem(LANGUAGE_LAST_APPLIED_STORAGE_KEY, JSON.stringify(record));
    setLastApplied(record);
  }

  return (
    <div className="h-full min-h-[560px] overflow-auto rounded-lg border border-white/10 bg-black/20 p-4" data-testid="nova-3-language-workbench">
      <header className="rounded-xl border border-cyan-200/20 bg-gradient-to-br from-cyan-300/[.08] via-[#071018] to-violet-300/[.06] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">Language Explorer</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Nova-3 Language Workbench</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Search, explore, and apply Nova-3 language configurations across the lab.</p>
        {hostedReviewMode ? <p className="mt-3 rounded border border-violet-200/20 bg-violet-200/[.05] p-3 text-xs leading-5 text-violet-50">Choose a language here, inspect the exact Nova-3 configuration, then carry it into a transcription workflow without running anything automatically.</p> : null}
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <aside className="order-1 min-h-0 rounded-xl border border-white/10 bg-[#071018]/80 p-4 xl:order-2" aria-label="Nova-3 supported language selector">
          <label htmlFor="language-workbench-search" className="text-xs font-semibold text-white">Search supported languages</label>
          <input ref={searchRef} id="language-workbench-search" value={search} onChange={(event) => { setSearch(event.target.value); setHighlightedIndex(0); }} onKeyDown={handleSearchKeyDown} data-shortcut-command="focus_search" placeholder="Italian, it, en-GB, Canada…" role="combobox" aria-autocomplete="list" aria-controls="language-workbench-list" aria-describedby="language-workbench-search-help" aria-expanded="true" aria-activedescendant={filtered[highlightedIndex] ? `language-option-${filtered[highlightedIndex].code}` : undefined} className={inputClass} />
          <p id="language-workbench-search-help" className="mt-2 text-[11px] leading-5 text-slate-500">Search by verified display name, full code, base language, or regional label. Enter selects the highlighted result; Escape clears the search.</p>
          <div id="language-workbench-list" role="listbox" aria-label="Verified Nova-3 language configurations" className="mt-3 max-h-[58vh] space-y-4 overflow-y-auto pr-1">
            {!filtered.length ? <p className="rounded border border-amber-200/20 bg-amber-200/[.05] p-3 text-xs text-amber-50">No supported language matches this search.</p> : null}
            <LanguageGroup title="Recently used" options={recentOptions} selectedCode={selected?.code} highlightedCode={filtered[highlightedIndex]?.code} onSelect={selectLanguage} />
            <LanguageGroup title="Multilingual" options={multilingual} selectedCode={selected?.code} highlightedCode={filtered[highlightedIndex]?.code} onSelect={selectLanguage} />
            <LanguageGroup title="Regional variants" options={regional} selectedCode={selected?.code} highlightedCode={filtered[highlightedIndex]?.code} onSelect={selectLanguage} />
            <LanguageGroup title="All languages" options={baseLanguages} selectedCode={selected?.code} highlightedCode={filtered[highlightedIndex]?.code} onSelect={selectLanguage} />
          </div>
        </aside>

        <main className="order-2 min-w-0 space-y-4 xl:order-1" aria-live="polite">
          {!selected ? <section className={panelClass}><p className="text-sm text-slate-300">Choose a language to inspect its configuration and use it across the lab.</p></section> : <LanguageDetails selected={selected} lastApplied={lastApplied} copied={copied} feedback={feedback} onCopy={copySnippet} onApply={apply} onUseSampleInTts={onUseSampleInTts} />}
        </main>
      </div>
    </div>
  );
}

function LanguageDetails({ selected, lastApplied, copied, feedback, onCopy, onApply, onUseSampleInTts }: {
  selected: DeepgramLanguageOption;
  lastApplied: LanguageLastAppliedRecord | null;
  copied: string;
  feedback: string;
  onCopy: (label: string, value: string) => Promise<void>;
  onApply: (destination: LanguageHandoffDestination) => void;
  onUseSampleInTts: (language: DeepgramNova3LanguageCode, text: string) => boolean;
}) {
  const code = selected.code as DeepgramNova3LanguageCode;
  const snippets = languageWorkbenchSnippets(code);
  const region = languageRegionLabel(selected);
  const base = languageBaseOption(code);
  const variants = relatedRegionalVariants(code);
  const sample = reviewedSampleForLanguage(code);
  const multilingualAvailable = selected.code === "multi" || selected.multilingualAvailability;
  const metadataIncomplete = !selected.compatibleModels?.length || !selected.compatibleTransports?.length || !selected.lastVerifiedAt;

  return <>
    <section className={panelClass} aria-labelledby="selected-language-title">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200/65">Selected language</p><h3 id="selected-language-title" className="mt-1 text-xl font-semibold text-white">{selected.name}</h3><p className="mt-1 font-mono text-sm text-cyan-100" aria-label={`Language code ${selected.code}`}>Code: {selected.code}</p></div><span className="rounded border border-emerald-200/20 bg-emerald-200/[.05] px-2 py-1 text-[10px] font-semibold text-emerald-100">Available in selected modules</span></div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Model" value="nova-3" /><Detail label="Configuration mode" value={selected.code === "multi" ? "Verified multilingual transcription" : "Explicit single-language transcription"} /><Detail label="Base language" value={base?.name ?? selected.name} /><Detail label="Regional variant" value={region ?? "Base language code"} /><Detail label="Supported lab workflows" value="Transcribe URL, Upload Audio, Live Mic, API Studio" /><Detail label="Verified metadata" value={selected.lastVerifiedAt ?? DEEPGRAM_LANGUAGE_LAST_VERIFIED_AT} /></dl>
      {metadataIncomplete ? <p className="mt-3 rounded border border-amber-200/20 bg-amber-200/[.05] p-3 text-xs text-amber-50">Core configuration is available. Additional guidance has not yet been reviewed.</p> : null}
      {lastApplied ? <p className="mt-3 rounded border border-white/10 bg-black/20 p-3 text-xs text-slate-400">Last applied locally: <span className="text-slate-200">{getDeepgramNova3LanguageOption(lastApplied.code)?.name ?? lastApplied.code}</span> → {destinationLabel(lastApplied.destination)} at {new Date(lastApplied.usedAt).toLocaleString()}.</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2"><List title="Recommended lab configuration" items={languageRecommendedUses(selected)} /><List title={multilingualAvailable ? "Consider multilingual mode" : "Multilingual mode boundary"} items={multilingualAvailable ? ["when speakers switch among languages in the verified multilingual list", "when the input language is unknown but expected within that list", "when a recording contains substantial code-switching"] : ["This code is not in the repository's verified multilingual list.", "Keep the explicit code or gather current verified support evidence before changing modes."]} /></div>
      <List title="Known caveats from current project metadata" items={languageCaveats(selected)} tone="amber" />
    </section>

    <section className={panelClass}>
      <SectionHeading title="Configuration" detail="Exact, copyable syntax for the project's verified prerecorded `/v1/listen` request style." />
      <div className="mt-3 grid gap-3 xl:grid-cols-2"><Snippet title="Query parameters" code={snippets.query} copied={copied === "Query parameters"} onCopy={() => onCopy("Query parameters", snippets.query)} /><Snippet title="JSON configuration" code={snippets.json} copied={copied === "JSON configuration"} onCopy={() => onCopy("JSON configuration", snippets.json)} /><Snippet title="TypeScript example" code={snippets.typescript} copied={copied === "TypeScript example"} onCopy={() => onCopy("TypeScript example", snippets.typescript)} /><Snippet title="Python example" code={snippets.python} copied={copied === "Python example"} onCopy={() => onCopy("Python example", snippets.python)} /><Snippet title="cURL binary-audio example" code={snippets.curl} copied={copied === "cURL binary-audio example"} onCopy={() => onCopy("cURL binary-audio example", snippets.curl)} wide /></div>
      {feedback ? <p className={`mt-3 text-xs ${feedback.startsWith("Copy failed") ? "text-rose-200" : "text-emerald-200"}`} role="status">{feedback}</p> : null}
    </section>

    <section className={panelClass}>
      <SectionHeading title="Apply this configuration" detail="Navigation and prepopulation are local. Execution remains a separate visible action in the destination module." />
      <div className="mt-3 flex flex-wrap gap-2">{(["transcribe-url", "upload-audio", "live-mic", "api-studio"] as const).map((destination) => <button key={destination} type="button" onClick={() => onApply(destination)} className={buttonClass}>{destinationActionLabel(destination)}</button>)}</div>
      <button type="button" onClick={() => onCopy("JSON configuration", snippets.json)} className={`${secondaryButtonClass} mt-3`} aria-label="Copy JSON configuration and stay in Language Explorer">Copy and stay here</button>
    </section>

    <section className={panelClass}>
      <SectionHeading title={`${selected.name} vs multilingual`} detail="Configuration guidance, not a benchmark result." />
      <div className="mt-3 grid gap-3 md:grid-cols-2"><Comparison title={selected.code === "multi" ? "Explicit language code" : `Explicit ${selected.name}`} rows={selected.code === "multi" ? ["Use when the primary language is known in advance.", "More constrained configuration: one verified code.", "Choose and validate a representative explicit-language fixture."] : [`Use when ${selected.name} is known in advance.`, "More constrained configuration.", `Best lab fit: primarily ${selected.name} audio.`]} /><Comparison title="Multilingual" rows={multilingualAvailable ? ["Use when the input may switch among verified multilingual languages.", "Broader recognition scope than one explicit code.", "Best lab fit: mixed-language and unknown-language comparisons."] : ["Unsupported as a substitute for this language in current verified data.", "Do not silently replace the explicit code.", "Gather current support evidence before testing this alternative."]} /></div>
    </section>

    <section className={panelClass}>
      <SectionHeading title="Applied Engineering Note" detail="A starting hypothesis to validate with representative recordings." />
      <div className="mt-3 grid gap-3 md:grid-cols-2"><Note title="Customer scenario">A support organization receives recordings primarily in {selected.code === "multi" ? "languages from the verified multilingual list" : selected.name}, with occasional product names or mixed-language phrases.</Note><Note title="Recommended starting point"><code>model: nova-3</code><br /><code>language: {selected.code}</code></Note><Note title="Alternative">{multilingualAvailable && selected.code !== "multi" ? "Use multilingual mode when substantial code-switching among verified languages is expected." : selected.code === "multi" ? "Compare against an explicit code when the primary language becomes known." : "No multilingual substitution is verified for this language in current project data."}</Note><Note title="Validation plan"><ul className="list-disc pl-4"><li>test representative recordings</li><li>compare only verified alternatives</li><li>inspect names and domain terms</li><li>verify regional audio where applicable</li><li>evaluate latency and error patterns</li><li>avoid choosing from one ideal sample</li></ul></Note></div>
    </section>

    <section className={panelClass}>
      <SectionHeading title="Sample text" detail="Curated neutral fixture text; native-speaker or translation-quality certification is not claimed." />
      {sample ? <div className="mt-3 rounded border border-white/10 bg-black/20 p-3"><p className="text-sm leading-6 text-white">{sample.text}</p><p className="mt-2 text-xs text-slate-500">Plain-English meaning: {sample.englishMeaning}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} onClick={() => onCopy("Sample text", sample.text)} aria-label={`Copy sample text for ${selected.name}`}>{copied === "Sample text" ? "Copied" : "Copy sample text"}</button>{canUseSampleInTts(code) ? <button type="button" className={buttonClass} onClick={() => onUseSampleInTts(code, sample.text)}>Use in Text to Speech</button> : null}</div></div> : <p className="mt-3 rounded border border-white/10 bg-black/20 p-3 text-xs text-slate-400">Reviewed sample text not yet included.</p>}
    </section>

    {variants.length > 1 ? <section className={panelClass}><details><summary className="cursor-pointer text-sm font-semibold text-white">Compare regional variants</summary><p className="mt-2 text-xs leading-5 text-slate-500">These are distinct verified configuration values. This view does not claim how a model handles dialect or accent differences.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{variants.map((variant) => <div key={variant.code} className="rounded border border-white/10 bg-black/20 p-3"><p className="text-xs font-semibold text-slate-200">{variant.name}</p><p className="mt-1 font-mono text-[11px] text-cyan-100">{variant.code}</p></div>)}</div></details></section> : null}
  </>;
}

function LanguageGroup({ title, options, selectedCode, highlightedCode, onSelect }: { title: string; options: readonly DeepgramLanguageOption[]; selectedCode?: string; highlightedCode?: string; onSelect: (code: DeepgramNova3LanguageCode) => void }) {
  if (!options.length) return null;
  const groupId = `language-group-${title.replaceAll(" ", "-").toLowerCase()}`;
  return <div role="group" aria-labelledby={groupId}><h3 id={groupId} className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">{title}</h3><div className="space-y-1">{options.map((option) => { const selected = option.code === selectedCode; const highlighted = option.code === highlightedCode; return <button id={`language-option-${option.code}`} key={option.code} type="button" role="option" aria-selected={selected} aria-label={`${option.name}, language code ${option.code}`} title={`${option.name} (${option.code})`} onClick={() => onSelect(option.code as DeepgramNova3LanguageCode)} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left transition ${selected ? "border-cyan-200/40 bg-cyan-200/[.1] text-white" : highlighted ? "border-violet-200/25 bg-violet-200/[.05] text-slate-200" : "border-white/[.08] bg-black/20 text-slate-400 hover:border-cyan-200/25"}`}><span className="min-w-0 text-xs leading-4"><span className="block break-words">{option.name}</span>{selected ? <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-cyan-100">Selected</span> : null}</span><span className="shrink-0 font-mono text-[11px] text-cyan-100">{option.code}</span></button>; })}</div></div>;
}

function Snippet({ title, code, copied, onCopy, wide = false }: { title: string; code: string; copied: boolean; onCopy: () => void; wide?: boolean }) { return <article className={`min-w-0 rounded-lg border border-white/10 bg-[#02060b] p-3 ${wide ? "xl:col-span-2" : ""}`}><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold text-white">{title}</h4><button type="button" onClick={onCopy} className={copyButtonClass} aria-label={`Copy ${title}`}>{copied ? "Copied" : "Copy"}</button></div><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-cyan-50" tabIndex={0}>{code}</pre></article>; }
function SectionHeading({ title, detail }: { title: string; detail: string }) { return <div><h3 className="text-base font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded border border-white/10 bg-black/20 p-3"><dt className="text-[9px] font-bold uppercase tracking-[.13em] text-slate-600">{label}</dt><dd className="mt-1 text-xs leading-5 text-slate-300">{value}</dd></div>; }
function List({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "amber" }) { return <div className={`mt-3 rounded border p-3 ${tone === "amber" ? "border-amber-200/20 bg-amber-200/[.04]" : "border-white/10 bg-black/20"}`}><h4 className={`text-xs font-semibold ${tone === "amber" ? "text-amber-50" : "text-white"}`}>{title}</h4><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-400">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>; }
function Comparison({ title, rows }: { title: string; rows: string[] }) { return <article className="rounded border border-white/10 bg-black/20 p-3"><h4 className="text-xs font-semibold text-white">{title}</h4><ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">{rows.map((row) => <li key={row}>• {row}</li>)}</ul></article>; }
function Note({ title, children }: { title: string; children: ReactNode }) { return <article className="rounded border border-white/10 bg-black/20 p-3"><h4 className="text-xs font-semibold text-cyan-100">{title}</h4><div className="mt-2 text-xs leading-5 text-slate-400">{children}</div></article>; }

function readRecentLanguages() { try { return sanitizeRecentLanguages(JSON.parse(window.localStorage.getItem(LANGUAGE_RECENT_STORAGE_KEY) ?? "[]")); } catch { return []; } }
function readLastApplied(): LanguageLastAppliedRecord | null { try { return sanitizeLastAppliedLanguage(JSON.parse(window.localStorage.getItem(LANGUAGE_LAST_APPLIED_STORAGE_KEY) ?? "null")); } catch { return null; } }
function destinationActionLabel(value: LanguageHandoffDestination) { return value === "transcribe-url" ? "View URL transcription availability" : value === "upload-audio" ? "Use in Upload Audio" : value === "live-mic" ? "Use in Live Mic" : "Open in API Studio"; }
function destinationLabel(value: LanguageHandoffDestination) { return destinationActionLabel(value).replace(/^Use in |^Open in /, ""); }

const panelClass = "rounded-xl border border-white/10 bg-[#071018]/80 p-4";
const inputClass = "mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-200/40";
const buttonClass = "rounded-lg border border-cyan-200/35 bg-cyan-200 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-100";
const secondaryButtonClass = "rounded-lg border border-white/15 bg-white/[.05] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-200/30 focus-visible:outline-2 focus-visible:outline-cyan-100";
const copyButtonClass = "rounded border border-white/10 bg-white/[.04] px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-cyan-200/25 focus-visible:outline-2 focus-visible:outline-cyan-100";
