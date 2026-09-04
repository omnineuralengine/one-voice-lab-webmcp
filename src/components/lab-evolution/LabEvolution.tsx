import {
  CURRENT_LAB_EXPERIMENTS,
  EVIDENCE_PHILOSOPHY,
  LAB_DEVELOPMENT_ARCHITECTURE,
  LAB_EVOLUTION_KNOWN_LIMITATIONS,
  LAB_EVOLUTION_NEXT_HYPOTHESES,
  LAB_EVOLUTION_PURPOSE,
  LAB_EVOLUTION_TIMELINE,
  LAB_EVOLUTION_VERIFIED_AT,
  LAB_MODULE_MATURITY_OVERVIEW,
  RECURSIVE_LEARNING_LOOP,
  type LabEvidenceLabel,
  type LabEvidenceReference,
  type LabEvolutionEntry,
  type LabEvolutionTopic,
} from "@/lib/lab-evolution";
import { ModulePageShell } from "@/components/one";
import type { ReactNode } from "react";

const MATURITY_ORDER = ["implemented", "experimental", "partial", "planned", "unavailable"] as const;

export function LabEvolution() {
  return (
    <ModulePageShell
      aria-label="Lab Evolution"
      as="section"
      className="lab-evolution"
      data-testid="lab-evolution-module"
      style={{ minHeight: 0 }}
      watermarkEnabled={false}
    >
      <div className="lab-evolution-scroll">
        <header className="lab-evolution-hero" id="lab-evolution-why">
          <div className="lab-evolution-hero-copy">
            <p className="lab-evolution-eyebrow">Living engineering notebook</p>
            <h2>Lab Evolution</h2>
            <p className="lab-evolution-hero-lede">{LAB_EVOLUTION_PURPOSE.title}</p>
            <p className="lab-evolution-hero-statement">{LAB_EVOLUTION_PURPOSE.statement}</p>
          </div>
          <div className="lab-evolution-hero-evidence">
            <EvidenceBadge label={LAB_EVOLUTION_PURPOSE.status} />
            <dl>
              <div>
                <dt>Registry verified</dt>
                <dd><time dateTime={LAB_EVOLUTION_VERIFIED_AT}>{LAB_EVOLUTION_VERIFIED_AT}</time></dd>
              </div>
              <div>
                <dt>Recorded iterations</dt>
                <dd>{LAB_EVOLUTION_TIMELINE.length}</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="lab-evolution-notebook">
          <NotebookSection
            eyebrow="01 · Why the lab exists"
            title="Make the learning cycle inspectable"
            description="The Lab is not a static showcase. It keeps the reasoning, implementation, evidence, and unresolved questions close enough to review together."
          >
            <EvidenceReferenceList references={LAB_EVOLUTION_PURPOSE.evidence} />
          </NotebookSection>

          <NotebookSection
            eyebrow="02 · Recursive learning loop"
            title="Every answer should produce a better question"
            description="The order is intentional: shipping is part of the learning cycle, not the end of it."
            testId="recursive-learning-loop"
          >
            <div className="lab-evolution-flow-scroll" tabIndex={0} aria-label="Scrollable recursive learning loop">
              <ol className="lab-evolution-loop">
                {RECURSIVE_LEARNING_LOOP.map((node, index) => (
                  <li data-loop-step={node.id} key={node.id}>
                    <span className="lab-evolution-node-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <strong>{node.label}</strong>
                    <p>{node.description}</p>
                  </li>
                ))}
              </ol>
            </div>
            <p className="lab-evolution-loop-return">Question again returns the evidence to the start of the loop.</p>
          </NotebookSection>

          <NotebookSection
            eyebrow="03 · Current architecture"
            title="Source control and deployment stay explicit"
            description="The primary path is canonical. Context capture sits beside it and does not change delivery behavior."
            testId="development-architecture"
          >
            <div className="lab-evolution-flow-scroll" tabIndex={0} aria-label="Scrollable development architecture">
              <ol className="lab-evolution-architecture-flow">
                {LAB_DEVELOPMENT_ARCHITECTURE.primaryFlow.map((node, index) => (
                  <li key={node.id}>
                    <span className="lab-evolution-node-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <strong>{node.label}</strong>
                    <p>{node.description}</p>
                    <EvidenceBadge label={node.status} compact />
                  </li>
                ))}
              </ol>
            </div>

            <aside className="lab-evolution-entire" data-testid="entire-context-layer" aria-labelledby="entire-context-title">
              <div>
                <p className="lab-evolution-branch-label">Parallel from Codex</p>
                <h4 id="entire-context-title">{LAB_DEVELOPMENT_ARCHITECTURE.parallelContextNodes[0].label}</h4>
                <p>{LAB_DEVELOPMENT_ARCHITECTURE.parallelContextNodes[0].description}</p>
              </div>
              <EvidenceBadge label={LAB_DEVELOPMENT_ARCHITECTURE.parallelContextNodes[0].status} />
            </aside>

            <ul className="lab-evolution-boundaries" aria-label="Development architecture boundaries">
              {LAB_DEVELOPMENT_ARCHITECTURE.boundaries.map((boundary) => <li key={boundary}>{boundary}</li>)}
            </ul>
            <EvidenceReferenceList references={LAB_DEVELOPMENT_ARCHITECTURE.evidence} />
          </NotebookSection>

          <NotebookSection
            eyebrow="04 · Evidence philosophy"
            title="Labels say what the evidence can actually support"
            description="Implementation, documentation, assumptions, and experiments remain visibly distinct."
            testId="evidence-philosophy"
          >
            <div className="lab-evolution-evidence-grid">
              {EVIDENCE_PHILOSOPHY.map((item) => (
                <article key={item.label}>
                  <EvidenceBadge label={item.label} />
                  <p>{item.summary}</p>
                  <SourceReference source={item.source} />
                </article>
              ))}
            </div>
          </NotebookSection>

          <NotebookSection
            eyebrow="05 · Current module maturity"
            title="Implemented, partial, and planned stay separate"
            description="This overview is derived from the repository capability registry. A planned capability remains planned even when the broader Lab is working."
            testId="module-maturity-overview"
          >
            <div className="lab-evolution-maturity-summary" aria-label="Module maturity totals">
              {MATURITY_ORDER.map((status) => {
                const count = LAB_MODULE_MATURITY_OVERVIEW.filter((module) => module.implementationStatus === status).length;
                if (!count) return null;
                return (
                  <div key={status}>
                    <span>{titleCase(status)}</span>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
            <div className="lab-evolution-maturity-list" role="list">
              {LAB_MODULE_MATURITY_OVERVIEW.map((module) => (
                <article key={module.id} role="listitem">
                  <div className="lab-evolution-maturity-main">
                    <div>
                      <p className="lab-evolution-item-kicker">{titleCase(module.implementationStatus)} · {titleCase(module.maturity)}</p>
                      <h4>{module.name}</h4>
                    </div>
                    <EvidenceBadge label={module.currentEvidenceStatus} compact />
                  </div>
                  <p>{module.why}</p>
                  <div className="lab-evolution-maturity-meta">
                    <span>Verified <time dateTime={module.lastVerifiedAt}>{module.lastVerifiedAt}</time></span>
                    <SourceReference source={module.documentationPath} />
                    {module.route ? <a href={module.route}>Open module</a> : null}
                  </div>
                </article>
              ))}
            </div>
          </NotebookSection>

          <NotebookSection
            eyebrow="06 · Evolution timeline"
            title="Repository evidence, learning, then the next hypothesis"
            description="Entries come from repository-controlled structured data. Optional commits, checkpoints, and test records appear only when evidence exists."
            testId="evolution-timeline"
          >
            <ol className="lab-evolution-timeline">
              {(LAB_EVOLUTION_TIMELINE as readonly LabEvolutionEntry[]).map((entry, index) => (
                <li key={entry.id}>
                  <details open={index === LAB_EVOLUTION_TIMELINE.length - 1}>
                    <summary>
                      <span>
                        <time dateTime={entry.date}>{entry.date}</time>
                        <strong>{entry.title}</strong>
                      </span>
                      <EvidenceBadge label={entry.status} compact />
                    </summary>
                    <div className="lab-evolution-timeline-body">
                      <p>{entry.description}</p>
                      <ul className="lab-evolution-module-tags" aria-label="Affected modules">
                        {entry.modules.map((module) => <li key={module}>{module}</li>)}
                      </ul>
                      {entry.gitCommit ? (
                        <p className="lab-evolution-optional-evidence"><strong>Git commit</strong><code title={entry.gitCommit}>{entry.gitCommit}</code></p>
                      ) : null}
                      {entry.entireCheckpoint ? (
                        <p className="lab-evolution-optional-evidence"><strong>Entire checkpoint</strong><code>{entry.entireCheckpoint}</code></p>
                      ) : null}
                      {entry.tests?.length ? (
                        <div className="lab-evolution-test-evidence">
                          <h5>Recorded tests</h5>
                          {entry.tests.map((test) => (
                            <div key={`${test.result}:${test.source}`}>
                              <p>{test.result}</p>
                              <SourceReference source={test.source} />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <dl className="lab-evolution-learning-pair">
                        <div><dt>Learning</dt><dd>{entry.learning}</dd></div>
                        <div><dt>Next hypothesis</dt><dd>{entry.nextHypothesis}</dd></div>
                      </dl>
                      <EvidenceReferenceList references={entry.evidence} />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </NotebookSection>

          <TopicSection
            eyebrow="07 · Current experiments"
            title="What the Lab is actively trying to learn"
            description="Experiments stay bounded by their observed evidence and do not become working claims by repetition."
            topics={CURRENT_LAB_EXPERIMENTS}
            testId="current-experiments"
          />

          <TopicSection
            eyebrow="08 · Known limitations"
            title="The edges remain visible"
            description="Limitations are part of the engineering record, not footnotes to hide after a demo."
            topics={LAB_EVOLUTION_KNOWN_LIMITATIONS}
            testId="known-limitations"
          />

          <TopicSection
            eyebrow="09 · Next hypotheses"
            title="Questions worth testing next"
            description="These are proposed tests, not promises, roadmap commitments, or already implemented behavior."
            topics={LAB_EVOLUTION_NEXT_HYPOTHESES}
            testId="next-hypotheses"
          />
        </div>
      </div>
    </ModulePageShell>
  );
}

function NotebookSection({
  eyebrow,
  title,
  description,
  children,
  testId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="lab-evolution-section" data-testid={testId}>
      <header className="lab-evolution-section-heading">
        <p>{eyebrow}</p>
        <h3>{title}</h3>
        <span>{description}</span>
      </header>
      <div className="lab-evolution-section-body">{children}</div>
    </section>
  );
}

function TopicSection({
  eyebrow,
  title,
  description,
  topics,
  testId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  topics: readonly LabEvolutionTopic[];
  testId: string;
}) {
  return (
    <NotebookSection eyebrow={eyebrow} title={title} description={description} testId={testId}>
      <div className="lab-evolution-topic-list">
        {topics.map((topic) => (
          <article key={topic.id}>
            <div className="lab-evolution-topic-heading">
              <h4>{topic.title}</h4>
              <EvidenceBadge label={topic.status} compact />
            </div>
            <p>{topic.description}</p>
            {topic.nextHypothesis ? (
              <p className="lab-evolution-next"><strong>Next hypothesis</strong>{topic.nextHypothesis}</p>
            ) : null}
            <EvidenceReferenceList references={topic.evidence} />
          </article>
        ))}
      </div>
    </NotebookSection>
  );
}

function EvidenceReferenceList({ references }: { references: readonly LabEvidenceReference[] }) {
  if (!references.length) return null;
  return (
    <ul className="lab-evolution-evidence-list" aria-label="Evidence references">
      {references.map((reference) => (
        <li key={`${reference.label}:${reference.source}`}>
          <EvidenceBadge label={reference.label} compact />
          <div>
            <p>{reference.summary}</p>
            <SourceReference source={reference.source} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EvidenceBadge({ label, compact = false }: { label: LabEvidenceLabel; compact?: boolean }) {
  const tone = label === "Repository verified" ? "green" : label === "Deepgram documentation verified" ? "purple" : "amber";
  return (
    <span
      className={`lab-evidence-badge lab-evidence-badge--${tone}${compact ? " is-compact" : ""}`}
      data-evidence-label={label}
    >
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

function SourceReference({ source }: { source: string }) {
  return <code className="lab-evolution-source">{source}</code>;
}

function titleCase(value: string) {
  return value.replace(/(^|[-_])([a-z])/g, (_match, space: string, letter: string) => `${space ? " " : ""}${letter.toUpperCase()}`);
}
