"use client";

import type { EvaluationMetric, HumanRating } from "@/lib/evaluation/schema";

import { HumanRatingEditor } from "@/components/evaluate/HumanRating";
import { AdaptiveSection, TechnicalDetails } from "@/components/one/AdaptiveInterface";
import { metricByName, type ClientResult } from "@/components/evaluate/types";

const PRIMARY_METRICS: ReadonlyArray<{ name: EvaluationMetric["name"]; label: string }> = [
  { name: "server_time_to_first_audio_chunk", label: "Server time to first chunk" },
  { name: "time_to_first_audible_output", label: "First audible output" },
  { name: "total_generation_time", label: "Total generation" },
  { name: "audio_duration", label: "Audio duration" },
  { name: "real_time_factor", label: "Real-time factor" },
  { name: "client_time_to_playable", label: "Client time to playable" },
  { name: "estimated_cost", label: "Estimated cost" },
  { name: "request_success", label: "Request outcome" },
];

export function ResultCard({
  result,
  blind,
  revealed,
  rating,
  onRating,
  onAudio,
  onPlayable,
  providerDisplayName,
}: {
  result: ClientResult;
  blind: boolean;
  revealed: boolean;
  rating: HumanRating;
  onRating: (rating: HumanRating) => void;
  onAudio: (element: HTMLAudioElement | null) => void;
  onPlayable: (playableAtMonotonic: number) => void;
  providerDisplayName: string;
}) {
  const hidden = blind && !revealed;
  const visibleName = hidden
    ? result.evidence.blindLabel
    : blind
      ? `${result.evidence.blindLabel} → ${providerDisplayName}`
      : providerDisplayName;
  const status = result.evidence.status;
  const visibleStatus = hidden ? (status === "complete" ? "Ready" : "Unavailable") : statusLabel(status);
  return (
    <article className="evaluate-result-card" data-status={hidden ? "neutral" : status}>
      <header>
        <div>
          <p>{hidden ? "Blind listening" : "Provider result"}</p>
          <h3>{visibleName}</h3>
        </div>
        <span className={`evaluate-status ${hidden ? "" : `evaluate-status--${status}`}`} role="status">{visibleStatus}</span>
      </header>

      <p className="evaluate-result-meaning">
        {status === "complete"
          ? "This output completed for the recorded scenario. Listen before using measurements or ratings to interpret the result."
          : "This lane did not produce a complete output. Its failure does not erase another provider's successful evidence."}
      </p>

      {!hidden ? (
        <AdaptiveSection description="Model, voice, adapter, environment, region, and dispatch state." minimum="detailed" summary="Inspect provider and configuration identity">
          <dl className="evaluate-identifiers">
            <div><dt>Model</dt><dd>{result.evidence.model}</dd></div>
            <div><dt>Voice</dt><dd>{result.evidence.voice}</dd></div>
            <div><dt>Adapter</dt><dd>{result.evidence.adapterVersion}</dd></div>
            <div><dt>{result.evidence.regionScope === "provider" ? "Provider region" : "ONE server region"}</dt><dd>{result.evidence.region ?? "Not observed"}</dd></div>
            <div><dt>Environment</dt><dd>{result.evidence.environment}</dd></div>
            <div><dt>Provider request</dt><dd>{result.evidence.requestTimestamp ? <time dateTime={result.evidence.requestTimestamp}>{formatTimestamp(result.evidence.requestTimestamp)}</time> : "Not dispatched"}</dd></div>
          </dl>
        </AdaptiveSection>
      ) : (
        <p className="evaluate-blind-note">Identity, model, voice, configuration, filenames, and trace details stay hidden until reveal.</p>
      )}

      {!hidden ? (
        <TechnicalDetails className="evaluate-result-config" summary="Inspect exact recorded configuration">
          <pre>{JSON.stringify(result.evidence.providerSpecificConfiguration, null, 2)}</pre>
        </TechnicalDetails>
      ) : null}

      {result.audioUrl && status === "complete" ? (
        <audio
          aria-label={`Playback for ${visibleName}`}
          controls
          onCanPlay={(event) => onPlayable(event.timeStamp)}
          preload="auto"
          ref={onAudio}
          src={result.audioUrl}
        />
      ) : (
        <p className="evaluate-audio-unavailable">
          {status === "complete"
            ? "This evidence bundle does not embed audio."
            : hidden
              ? "This voice did not complete. Details remain hidden until reveal."
              : result.evidence.sanitizedError?.message ?? `Audio is ${status}.`}
        </p>
      )}

      {!hidden ? (
        <AdaptiveSection description="Measured timing, duration, cost availability, and request outcome." minimum="detailed" summary="Inspect measured evidence">
          <section aria-label={`Measured evidence for ${visibleName}`} className="evaluate-metrics">
            {PRIMARY_METRICS.map((definition) => (
              <Metric key={definition.name} label={definition.label} metric={metricByName(result.evidence, definition.name)} />
            ))}
          </section>
          <details className="evaluate-disclosure evaluate-metric-methods">
            <summary>How these metrics were measured</summary>
          <dl>
            {PRIMARY_METRICS.map((definition) => {
              const metric = metricByName(result.evidence, definition.name);
              return (
                <div key={definition.name}>
                  <dt>{definition.label}</dt>
                  <dd>{metric?.provenance.description ?? "This metric was not collected."}</dd>
                </div>
              );
            })}
          </dl>
          </details>
          <p className="evaluate-sample-note">Sample count: n=1. Median needs n≥3; p95 needs n≥20 comparable runs.</p>
        </AdaptiveSection>
      ) : null}

      <HumanRatingEditor disabled={status !== "complete" || !result.audioUrl} label={visibleName} onChange={onRating} rating={rating} />
      {status === "complete" && !result.audioUrl ? (
        <p className="evaluate-audio-unavailable">Imported ratings are read-only because this sanitized bundle does not contain playable audio.</p>
      ) : null}

      {!hidden ? <TechnicalDetails className="evaluate-trace" summary="Inspect trace and sanitized technical evidence">
        <div>
          <ol>
            {result.evidence.trace.map((event, index) => (
              <li key={`${event.type}-${event.timestamp}-${index}`}>
                <span aria-hidden="true" />
                <div>
                  <strong>{traceLabel(event.type)}</strong>
                  <small>{event.offsetMs === null ? "Time unavailable" : `+${formatNumber(event.offsetMs)} ms`} · {event.observation}</small>
                  {!hidden ? <p>{event.detail}</p> : null}
                </div>
              </li>
            ))}
          </ol>
          <details className="evaluate-raw-inspector">
            <summary>Sanitized evidence JSON</summary>
            <pre>{JSON.stringify(result.evidence, null, 2)}</pre>
          </details>
        </div>
      </TechnicalDetails> : null}
    </article>
  );
}

function Metric({ label, metric }: { label: string; metric: EvaluationMetric | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatMetric(metric)}</dd>
      <small>{metric ? `${metric.measurementPoint} · ${metric.availability}` : "not collected"}</small>
    </div>
  );
}

function formatMetric(metric: EvaluationMetric | null): string {
  if (!metric || metric.availability === "unavailable" || metric.value === null) return "Unavailable";
  if (metric.unit === "milliseconds") return `${formatNumber(metric.value)} ms`;
  if (metric.unit === "seconds") return `${formatNumber(metric.value)} s`;
  if (metric.unit === "ratio") return formatNumber(metric.value, 3);
  if (metric.unit === "usd") return `$${metric.value.toFixed(6)}`;
  if (metric.unit === "boolean") return metric.value ? "Success" : "Failed";
  return String(metric.value);
}

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(status: ClientResult["evidence"]["status"]): string {
  return {
    pending: "Pending",
    streaming: "Streaming",
    complete: "Complete",
    cancelled: "Cancelled",
    "timed-out": "Timed out",
    unavailable: "Unavailable",
    failed: "Failed",
  }[status];
}

function traceLabel(type: ClientResult["evidence"]["trace"][number]["type"]): string {
  return type.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}
