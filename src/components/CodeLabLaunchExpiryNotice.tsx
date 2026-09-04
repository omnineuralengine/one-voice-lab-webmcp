"use client";

import { useCodeLabLaunch } from "@/context/code-lab-launch-context";

export function CodeLabLaunchExpiryNotice() {
  const { expired, acknowledgeExpired } = useCodeLabLaunch();

  if (!expired) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-16 z-50 flex max-w-md items-start gap-3 rounded-lg border border-amber-300/25 bg-[#171007]/95 p-3 text-xs text-amber-50 shadow-2xl"
    >
      <p className="leading-5">
        The temporary Code Lab launch context expired after refresh. Your explicitly saved local drafts remain
        available; launch the quest again to restore its generated workspace.
      </p>
      <button
        type="button"
        onClick={acknowledgeExpired}
        className="shrink-0 rounded border border-amber-200/20 px-2 py-1 text-[10px] font-semibold hover:bg-amber-200/10 focus-visible:outline-2 focus-visible:outline-amber-100"
      >
        Dismiss
      </button>
    </div>
  );
}
