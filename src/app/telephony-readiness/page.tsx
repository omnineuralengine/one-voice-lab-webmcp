import type { Metadata } from "next";

import { TelephonyReadinessLab } from "@/components/telephony-readiness/TelephonyReadinessLab";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const metadata: Metadata = createPublicMetadata({
  title: "Twilio ConversationRelay Readiness Lab",
  description:
    "Run deterministic, credential-free telephony readiness simulations and inspect causal evidence without placing a live call.",
  path: "/telephony-readiness",
});

export default function TelephonyReadinessPage() {
  return <TelephonyReadinessLab />;
}
