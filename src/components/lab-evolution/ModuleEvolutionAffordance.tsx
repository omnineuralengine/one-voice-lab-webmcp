"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import {
  labEvolutionEntryById,
  labModuleMaturityById,
  type LabEvidenceLabel,
  type LabModuleMaturity,
} from "@/lib/lab-evolution";

export function ModuleEvolutionAffordance({
  moduleId,
  moduleName,
  profile,
  className = "",
}: {
  moduleId: string;
  moduleName?: string;
  profile?: LabModuleMaturity | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const generatedId = useId().replaceAll(":", "");
  const titleId = `module-evolution-title-${generatedId}`;
  const descriptionId = `module-evolution-description-${generatedId}`;
  const resolvedProfile = profile === undefined ? labModuleMaturityById(moduleId) : profile;
  const latestEntry = resolvedProfile?.lastEvolutionEntry
    ? labEvolutionEntryById(resolvedProfile.lastEvolutionEntry)
    : null;
  const displayName = resolvedProfile?.name ?? moduleName ?? "This module";

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  if (!resolvedProfile) {
    return (
      <Link
        aria-label={`Open Lab Evolution for ${moduleName ?? "this module"}`}
        className={`module-evolution-trigger is-link ${className}`.trim()}
        data-evolution-module-id={moduleId}
        data-testid="module-evolution-trigger"
        href="/?module=lab-evolution"
      >
        Lab Evolution
      </Link>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-controls={`module-evolution-dialog-${generatedId}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`module-evolution-trigger ${className}`.trim()}
        data-evolution-module-id={moduleId}
        data-testid="module-evolution-trigger"
        onClick={() => setOpen(true)}
      >
        Evolution
      </button>

      <dialog
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="module-evolution-dialog"
        data-evolution-module-id={moduleId}
        data-testid="module-evolution-dialog"
        id={`module-evolution-dialog-${generatedId}`}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={handleClose}
      >
        <header className="module-evolution-dialog-header">
          <div>
            <p>Module evolution</p>
            <h2 id={titleId}>{displayName}</h2>
            <span id={descriptionId}>Why this module exists, what the repository supports, and what should be tested next.</span>
          </div>
          <button type="button" autoFocus data-shortcut-dismiss onClick={closeDialog}>Close</button>
        </header>

        <div className="module-evolution-dialog-body">
          <section aria-labelledby={`module-evolution-why-${generatedId}`}>
            <p className="module-evolution-section-label">Why it exists</p>
            <h3 id={`module-evolution-why-${generatedId}`}>{resolvedProfile.name}</h3>
            <p>{resolvedProfile.why}</p>
          </section>

          <section aria-labelledby={`module-evolution-evidence-${generatedId}`}>
            <p className="module-evolution-section-label">Current evidence</p>
            <h3 id={`module-evolution-evidence-${generatedId}`}>Repository boundary</h3>
            <div className="module-evolution-evidence-row">
              <EvidenceBadge label={resolvedProfile.currentEvidenceStatus} />
              <span>{titleCase(resolvedProfile.implementationStatus)} · {titleCase(resolvedProfile.maturity)}</span>
            </div>
            <dl className="module-evolution-profile-meta">
              <div><dt>Last verified</dt><dd><time dateTime={resolvedProfile.lastVerifiedAt}>{resolvedProfile.lastVerifiedAt}</time></dd></div>
              <div><dt>Evidence source</dt><dd><code>{resolvedProfile.documentationPath}</code></dd></div>
            </dl>
          </section>

          {resolvedProfile.knownLimitations?.length ? (
            <section aria-labelledby={`module-evolution-limits-${generatedId}`}>
              <p className="module-evolution-section-label">Known limitations</p>
              <h3 id={`module-evolution-limits-${generatedId}`}>Current edges</h3>
              <ul>{resolvedProfile.knownLimitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            </section>
          ) : null}

          {resolvedProfile.nextExperiment ? (
            <section aria-labelledby={`module-evolution-next-${generatedId}`}>
              <p className="module-evolution-section-label">Next experiment</p>
              <h3 id={`module-evolution-next-${generatedId}`}>What to test next</h3>
              <p>{resolvedProfile.nextExperiment}</p>
            </section>
          ) : null}

          {latestEntry ? (
            <section aria-labelledby={`module-evolution-latest-${generatedId}`}>
              <p className="module-evolution-section-label">Last evolution entry</p>
              <div className="module-evolution-latest-heading">
                <h3 id={`module-evolution-latest-${generatedId}`}>{latestEntry.title}</h3>
                <EvidenceBadge label={latestEntry.status} />
              </div>
              <time dateTime={latestEntry.date}>{latestEntry.date}</time>
              <p>{latestEntry.description}</p>
              {latestEntry.gitCommit ? <code className="module-evolution-commit" title={latestEntry.gitCommit}>{latestEntry.gitCommit}</code> : null}
            </section>
          ) : null}
        </div>

        <footer className="module-evolution-dialog-footer">
          <p>GitHub remains canonical source control. Entire remains an experimental context layer.</p>
          <Link href="/?module=lab-evolution" onClick={closeDialog}>Open Lab Evolution</Link>
        </footer>
      </dialog>
    </>
  );
}

function EvidenceBadge({ label }: { label: LabEvidenceLabel }) {
  const tone = label === "Repository verified" ? "green" : label === "Deepgram documentation verified" ? "purple" : "amber";
  return (
    <span className={`lab-evidence-badge lab-evidence-badge--${tone} is-compact`} data-evidence-label={label}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

function titleCase(value: string) {
  return value.replace(/(^|[-_])([a-z])/g, (_match, space: string, letter: string) => `${space ? " " : ""}${letter.toUpperCase()}`);
}
