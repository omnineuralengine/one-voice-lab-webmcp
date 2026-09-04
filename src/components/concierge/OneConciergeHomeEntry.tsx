"use client";

import { useOneConcierge } from "@/components/concierge/OneConciergeProvider";
import { getOneConciergeIntent, type OneConciergeIntentId } from "@/lib/concierge/registry";

const STARTING_GOAL_IDS = ["transcribe", "evaluate", "scenario"] as const satisfies readonly OneConciergeIntentId[];

export function OneConciergeHomeEntry() {
  const concierge = useOneConcierge();
  return (
    <section aria-labelledby="one-concierge-entry-title" className="one-concierge-entry">
      <div className="one-concierge-entry__copy">
        <p>ONE Voice Concierge</p>
        <h2 id="one-concierge-entry-title">Tell ONE what you want to accomplish.</h2>
        <span>Get a short explanation of the right existing journey—without choosing a provider, model, or API first.</span>
        <div className="one-concierge-entry__boundary">
          <strong>Guide, not gate</strong>
          <span>No action runs until you arrive and choose it there.</span>
        </div>
      </div>
      <div className="one-concierge-entry__actions">
        <button aria-expanded={concierge.isOpen} aria-haspopup="dialog" className="one-concierge-entry__primary" type="button" onClick={(event) => concierge.openConcierge({ opener: event.currentTarget })}>Ask ONE</button>
        <div aria-label="Start with a suggested goal" role="group">
          {STARTING_GOAL_IDS.map((intentId) => {
            const intent = getOneConciergeIntent(intentId);
            if (!intent) return null;
            return <button aria-expanded={concierge.isOpen} aria-haspopup="dialog" key={intent.id} type="button" onClick={(event) => concierge.openConcierge({ opener: event.currentTarget, preset: intent.synonyms[0] })}>{intent.label}</button>;
          })}
        </div>
      </div>
    </section>
  );
}
