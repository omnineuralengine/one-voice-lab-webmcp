"use client";

import Link from "next/link";

import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { LabModuleId } from "@/lib/code-snippets";
import type { DeepgramNova3LanguageCode } from "@/lib/deepgram-languages";
import { ExecutableApiStudio } from "@/components/api-studio/ExecutableApiStudio";

export type ApiStudioInitialConfiguration = {
  operationId: string;
  values?: Record<string, unknown>;
  model?: "nova-3";
  language?: DeepgramNova3LanguageCode;
  redact?: string[];
  explanation: string;
  sourceArtifactId?: string;
  sourceDiagnosisId?: string;
  transferredFields?: string[];
  notTransferred?: string[];
};

export function ApiStudio(props: {
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void;
  onReturnToQuestline?: () => void;
  onOperationChange?: (operationId: string) => void;
  initialOperationId?: string;
  initialConfiguration?: ApiStudioInitialConfiguration;
  openLabMode?: boolean;
}) {
  return (
    <div className="space-y-3">
      <nav aria-label="Voice provider API Studio" className="flex flex-wrap gap-2">
        <span aria-current="page" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] px-4 py-2 text-sm font-semibold text-emerald-100">Deepgram API Studio</span>
        <Link className="inline-flex min-h-11 items-center rounded-lg border border-violet-300/25 bg-violet-300/[0.06] px-4 py-2 text-sm font-semibold text-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200" href="/providers/elevenlabs/api-studio">Open ElevenLabs API Studio</Link>
      </nav>
      <ExecutableApiStudio {...props} />
    </div>
  );
}
