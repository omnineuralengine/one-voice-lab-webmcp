"use client";

import { useOneConcierge } from "@/components/concierge/OneConciergeProvider";

export function OneConciergeTrigger({ className = "", label = "Ask ONE" }: { className?: string; label?: string }) {
  const concierge = useOneConcierge();
  return (
    <button
      aria-expanded={concierge.isOpen}
      aria-haspopup="dialog"
      className={`one-concierge-trigger ${className}`.trim()}
      data-testid="ask-one-trigger"
      type="button"
      onClick={(event) => concierge.openConcierge({ opener: event.currentTarget })}
    >
      <span>{label}</span>
    </button>
  );
}
