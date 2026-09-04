"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useOneExperience } from "@/components/one/OneExperienceProvider";
import {
  depthIncludes,
  INTERFACE_DEPTHS,
  type InterfaceDepth,
} from "@/lib/one/interface-depth";

function joinClassNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function HumanDepthControl({
  compact = false,
  heading = "Choose how much detail ONE shows",
  className,
}: {
  compact?: boolean;
  heading?: string;
  className?: string;
}) {
  const one = useOneExperience();
  const descriptionId = useId();
  const [message, setMessage] = useState("");

  async function chooseDepth(depth: InterfaceDepth) {
    const result = await one.updateInterfaceDepth(depth);
    setMessage(result.message);
  }

  return (
    <fieldset
      className={joinClassNames("one-depth-control", compact && "one-depth-control--compact", className)}
      data-depth-source={one.interfaceDepthSource}
    >
      <legend>{heading}</legend>
      <p id={descriptionId}>
        This changes presentation only. It never changes access, ownership, provider policy, or what an action can do.
      </p>
      <div aria-describedby={descriptionId} className="one-depth-control__options">
        {INTERFACE_DEPTHS.map((option) => {
          const labelId = `${descriptionId}-${option.id}-label`;
          const optionDescriptionId = `${descriptionId}-${option.id}-description`;
          return <label key={option.id} title={option.description}>
            <input
              aria-describedby={`${descriptionId} ${optionDescriptionId}`}
              aria-labelledby={labelId}
              checked={one.interfaceDepth === option.id}
              disabled={!one.authReady}
              name={`${descriptionId}-choices`}
              type="radio"
              value={option.id}
              onChange={() => void chooseDepth(option.id)}
            />
            <span id={labelId}>{option.label}</span>
            <small className={compact ? "sr-only" : undefined} id={optionDescriptionId}>{option.description}</small>
          </label>
        })}
      </div>
      <p aria-live="polite" className="one-depth-control__status">
        {!one.authReady
          ? "Verifying the current account before changing this preference."
          : message || `${one.interfaceDepthSource === "guest-local" ? "Saved on this device" : one.interfaceDepthSource === "account-synced" ? "Synced to this ONE account" : "Account preference not yet synced"}.`}
      </p>
    </fieldset>
  );
}

export function AdaptiveSection({
  minimum,
  summary,
  description,
  children,
  className,
}: {
  minimum: InterfaceDepth;
  summary: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const { interfaceDepth } = useOneExperience();
  const visibleByPreference = depthIncludes(interfaceDepth, minimum);
  const disclosureRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (visibleByPreference) return;
    const revealDeepLink = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (target && disclosureRef.current?.contains(target)) disclosureRef.current.open = true;
    };
    revealDeepLink();
    window.addEventListener("hashchange", revealDeepLink);
    return () => window.removeEventListener("hashchange", revealDeepLink);
  }, [visibleByPreference]);

  if (visibleByPreference) {
    return (
      <section
        className={joinClassNames("one-adaptive-section", className)}
        data-adaptive-minimum={minimum}
        data-adaptive-state="expanded-by-preference"
      >
        {children}
      </section>
    );
  }

  return (
    <details
      className={joinClassNames("one-adaptive-disclosure", className)}
      data-adaptive-minimum={minimum}
      data-adaptive-state="available-on-request"
      ref={disclosureRef}
      suppressHydrationWarning
    >
      <summary>
        <span>{summary}</span>
        {description ? <small>{description}</small> : null}
      </summary>
      <div className="one-adaptive-disclosure__body">{children}</div>
    </details>
  );
}

export function ExplainThis({ children, summary = "Explain this" }: { children: ReactNode; summary?: string }) {
  return (
    <details className="one-explain-this">
      <summary>{summary}</summary>
      <div>{children}</div>
    </details>
  );
}

export function TechnicalDetails({
  children,
  summary = "Inspect technical details",
  description = "Stable identifiers, methodology, traces, and sanitized evidence.",
  className,
}: {
  children: ReactNode;
  summary?: string;
  description?: string;
  className?: string;
}) {
  return (
    <AdaptiveSection className={className} description={description} minimum="technical" summary={summary}>
      {children}
    </AdaptiveSection>
  );
}
