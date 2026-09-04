import type { DeepgramEndpointDefinition } from "@/types/deepgram-endpoint-registry";
import type { PocketApiSnippetLanguage } from "@/types/pocket-api-lab";

const SNIPPET_LANGUAGES: readonly PocketApiSnippetLanguage[] = ["curl", "javascript", "python", "json"];

export function PocketApiSnippetWorkbench({ endpoint, language, setLanguage, code, copied, pinned, onCopy, onPin }: { endpoint: DeepgramEndpointDefinition; language: PocketApiSnippetLanguage; setLanguage: (language: PocketApiSnippetLanguage) => void; code: string; copied: boolean; pinned: boolean; onCopy: () => void; onPin: () => void }) {
  return <div className="pocket-api-snippet"><div className="pocket-api-code-tabs" role="tablist" aria-label={`${endpoint.officialName} code examples`}>{SNIPPET_LANGUAGES.map((item) => <button key={item} type="button" role="tab" aria-selected={language === item} onClick={() => setLanguage(item)}>{item === "javascript" ? "JavaScript" : item === "python" ? "Python" : item.toUpperCase()}</button>)}</div><pre tabIndex={0}><code>{code}</code></pre><div className="pocket-api-snippet-actions"><button type="button" onClick={onCopy}>{copied ? "Copied" : `Copy ${language}`}</button><button type="button" aria-pressed={pinned} onClick={onPin}>{pinned ? "Unpin snippet" : "Pin snippet"}</button></div></div>;
}
