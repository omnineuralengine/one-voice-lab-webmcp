import Link from "next/link";

import { OneHeaderControls } from "@/components/one/OneHeaderControls";
import { OneMark } from "@/components/one/OneMark";
import { VOICE_OPEN_LAB_NAVIGATION, type VoiceOpenLabAreaId } from "@/lib/voice-open-lab/navigation";

type LegacyAreaId = "try" | "simulate" | "deepgram";

export function VoiceOpenLabNav({ current }: { current?: VoiceOpenLabAreaId | LegacyAreaId }) {
  const active = normalizeCurrentArea(current);
  return (
    <nav aria-label="Primary" className="voice-open-nav">
      <Link className="voice-open-nav__brand" href="/">
        <span aria-hidden="true" className="voice-open-nav__mark"><OneMark className="size-7 rounded-md" /></span>
        <span><strong>ONE Voice Lab</strong><small>Omni Neural Engine · independent</small></span>
      </Link>
      <div className="voice-open-nav__links">
        {VOICE_OPEN_LAB_NAVIGATION.map((item) => (
          <Link aria-current={active === item.id ? "page" : undefined} href={item.href} key={item.id}>{item.label}</Link>
        ))}
      </div>
      <div className="voice-open-nav__utilities"><OneHeaderControls /><Link className="voice-open-nav__command" href="/?command=1">Commands <kbd>Ctrl K</kbd></Link></div>
    </nav>
  );
}

function normalizeCurrentArea(current?: VoiceOpenLabAreaId | LegacyAreaId): VoiceOpenLabAreaId | undefined {
  if (current === "try" || current === "simulate") return "explore";
  if (current === "deepgram") return "compare";
  return current;
}
