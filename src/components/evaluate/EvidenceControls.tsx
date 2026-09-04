"use client";

import { useRef, useState } from "react";

import { importEvidenceBundle } from "@/lib/evaluation/evidence";
import { EVALUATION_IMPORT_MAX_BYTES } from "@/lib/evaluation/schema";
import type { EvaluationEvidenceBundle } from "@/lib/evaluation/schema";

export function EvidenceControls({
  canExport,
  disabled,
  onExport,
  onImport,
}: {
  canExport: boolean;
  disabled: boolean;
  onExport: () => void;
  onImport: (bundle: EvaluationEvidenceBundle) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size === 0 || file.size > EVALUATION_IMPORT_MAX_BYTES) {
        throw new Error(`Evidence files must be between 1 byte and ${EVALUATION_IMPORT_MAX_BYTES.toLocaleString()} bytes.`);
      }
      const bundle = await importEvidenceBundle(new Uint8Array(await file.arrayBuffer()));
      onImport(bundle);
      setMessage(`Imported ${bundle.providerResults.length} sanitized provider results. No paid calls were made.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This evidence file cannot be inspected.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section aria-labelledby="evaluate-evidence-heading" className="evaluate-evidence-controls">
      <div>
        <p className="evaluate-kicker">Evidence portability</p>
        <h2 id="evaluate-evidence-heading">Private by default. Portable by choice.</h2>
        <p>Export sanitized configuration and provenance, or inspect a compatible bundle without rerunning provider calls. Audio is not embedded.</p>
      </div>
      <div>
        <button disabled={disabled || !canExport} onClick={onExport} type="button">Export evidence JSON</button>
        <button disabled={disabled} onClick={() => inputRef.current?.click()} type="button">Import evidence JSON</button>
        <input
          accept="application/json,.json"
          className="evaluate-file-input"
          onChange={(event) => void importFile(event.target.files?.[0])}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
      </div>
      {message ? <p aria-live="polite" className="evaluate-import-message">{message}</p> : null}
    </section>
  );
}
