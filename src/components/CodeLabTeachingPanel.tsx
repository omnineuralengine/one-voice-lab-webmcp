import type { CodeLabFile, CodeLabWorkflow } from "@/lib/code-lab-files";

export type FileTeachingDetails = {
  layer?: string;
  runtime?: string;
  canAccessApiKey?: string;
  callsDeepgramDirectly?: string;
  receivesRawAudio?: string;
  receivesTranscriptJson?: string;
  commonMistakes?: string[];
  productionNotes?: string[];
};

export function CodeLabTeachingPanel({
  workflow,
  file,
  details,
  flow,
}: {
  workflow: CodeLabWorkflow;
  file: CodeLabFile;
  details?: FileTeachingDetails;
  flow?: string[];
}) {
  const derived = deriveTeachingDetails(file);
  const teaching = { ...derived, ...details };
  const activeFlow = flow?.length ? flow : file.requestFlow;

  return (
    <aside className="min-h-0 overflow-auto border-l border-white/10 bg-[#071018]">
      <div className="border-b border-white/10 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Where this code lives</p>
        <h3 className="mt-1 break-words font-mono text-xs font-semibold text-white">{file.path}</h3>
        <p className="mt-2 text-xs leading-5 text-slate-500">{workflow.title}</p>
      </div>

      <div className="divide-y divide-white/10 px-3">
        <TeachingRow label="File role" value={file.role} />
        <TeachingRow label="Layer" value={teaching.layer} />
        <TeachingRow label="Runs in" value={teaching.runtime} />
        <TeachingRow label="Can access DEEPGRAM_API_KEY?" value={teaching.canAccessApiKey} security />
        <TeachingRow label="Calls Deepgram directly?" value={teaching.callsDeepgramDirectly} />
        <TeachingRow label="Receives raw audio?" value={teaching.receivesRawAudio} />
        <TeachingRow label="Receives transcript JSON?" value={teaching.receivesTranscriptJson} />
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Generated flow</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeFlow.map((step, index) => (
            <span key={`${step}-${index}`} className="inline-flex items-center gap-2">
              <span className="rounded-md border border-cyan-200/15 bg-cyan-200/[0.06] px-2 py-1 text-xs text-cyan-50">{step}</span>
              {index < activeFlow.length - 1 ? <span className="text-slate-600">-&gt;</span> : null}
            </span>
          ))}
        </div>
      </div>

      <TeachingList title="Common mistakes" items={teaching.commonMistakes} />
      <TeachingList title="Production notes" items={teaching.productionNotes} />
    </aside>
  );
}

function TeachingRow({ label, value, security = false }: { label: string; value?: string; security?: boolean }) {
  return (
    <div className="py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xs leading-5 ${security ? "text-emerald-100" : "text-slate-300"}`}>{value || "Not applicable"}</p>
    </div>
  );
}

function TeachingList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;

  return (
    <div className="border-t border-white/10 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-xs leading-5 text-slate-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function deriveTeachingDetails(file: CodeLabFile): Required<FileTeachingDetails> {
  const browser = file.side === "Client-side";
  const server = file.side === "Server-side";
  const cli = file.side === "CLI";
  const config = file.side === "Config";
  const code = file.code.toLowerCase();

  return {
    layer: file.side,
    runtime: browser ? "Browser" : cli ? "Local shell/runtime" : config ? "Loaded by the local or server runtime" : "Server/runtime process",
    canAccessApiKey: browser
      ? "No. Use a local API route or a temporary browser token."
      : server || cli || config
        ? "Yes, from environment configuration only. Never serialize it into a response."
        : "Only when this shared file is imported exclusively by server code.",
    callsDeepgramDirectly: code.includes("api.deepgram.com") ? "Yes" : browser ? "No, it calls a local route or uses a temporary token." : "Not in this file.",
    receivesRawAudio: /audio|blob|mediarecorder|arraybuffer|formdata/.test(code) ? "Yes or passes an audio reference/stream." : "No raw audio in this file.",
    receivesTranscriptJson: file.responsePaths.some((path) => /transcript|results|channel|metadata/.test(path.toLowerCase()))
      ? "Yes, or it forwards the transcript response."
      : "No transcript JSON in this file.",
    commonMistakes: file.securityNotes,
    productionNotes: [file.whereItFits, ...file.environmentVariables.map((name) => `Configure ${name} outside source control.`)],
  };
}
