import type { CodeLabLanguage, CodeLabWorkflowId } from "@/lib/code-lab-files";

export type CodeLabLaunchMode = "replace" | "merge" | "temporary";
export type CodeLabLaunchSource = "questline" | "api-studio" | "applied-voice-systems";

export type CodeLabLaunchWorkflow = {
  id: CodeLabWorkflowId;
  title: string;
  description: string;
  deepgramCapabilities: string[];
  transport?: string;
  audioSource?: string;
  outputDestination?: string;
};

export type CodeLabLaunchProjectEntry = {
  path: string;
  role: string;
  layer: "client" | "server" | "shared" | "config" | "test" | "docs";
  editable: boolean;
  generated: boolean;
};

export type CodeLabLaunchSemanticRegion = {
  id: string;
  label: string;
  type:
    | "authentication"
    | "configuration"
    | "request"
    | "audio-input"
    | "audio-send"
    | "event-receive"
    | "response-parse"
    | "error-handling"
    | "cleanup"
    | "testing"
    | "observability";
  startLine: number;
  endLine: number;
  explanation: string;
};

export type CodeLabLaunchFile = {
  path: string;
  language: CodeLabLanguage;
  content: string;
  originalContent: string;
  role: string;
  layer: string;
  semanticRegions: CodeLabLaunchSemanticRegion[];
};

export type CodeLabLaunchLessonNote = {
  title: string;
  body: string;
  category:
    | "first-principles"
    | "runtime"
    | "audio"
    | "security"
    | "debugging"
    | "production"
    | "client-impact";
};

export type CodeLabLaunchEnvironmentVariable = {
  name: string;
  placeholder: string;
  location: string;
  serverOnly: boolean;
};

export type CodeLabLaunchContext = {
  id: string;
  createdAt: string;
  source: CodeLabLaunchSource;
  sourceId?: string;
  language: CodeLabLanguage;
  framework?: string;
  runtime?: string;
  ide?: string;
  operatingSystem?: string;
  workflow: CodeLabLaunchWorkflow;
  projectTree: CodeLabLaunchProjectEntry[];
  files: CodeLabLaunchFile[];
  lessonNotes: CodeLabLaunchLessonNote[];
  securityWarnings: string[];
  environmentVariables: CodeLabLaunchEnvironmentVariable[];
  relatedApiStudioOperationId?: string;
  relatedQuestNodeId?: string;
};

export type CodeLabLaunchContextInput = Omit<CodeLabLaunchContext, "id" | "createdAt">;

export type CodeLabSecretKind =
  | "api-key-assignment"
  | "authorization-credential"
  | "token-assignment"
  | "jwt"
  | "private-key"
  | "sensitive-field";

export type CodeLabSecretFinding = {
  path: string;
  kind: CodeLabSecretKind;
  confidence: "high";
  message: string;
};

export type CodeLabSnippetSanitization = {
  value: string;
  replacements: number;
  findings: CodeLabSecretFinding[];
};

export type CodeLabLaunchPreparationResult =
  | {
      ok: true;
      blocked: false;
      context: CodeLabLaunchContext;
      findings: CodeLabSecretFinding[];
      replacements: number;
    }
  | {
      ok: false;
      blocked: true;
      context: null;
      reason: "invalid-input" | "unresolved-secret";
      issues: string[];
      findings: CodeLabSecretFinding[];
      replacements: number;
    };

export type CodeLabLaunchAction = (
  input: CodeLabLaunchContextInput,
  mode?: CodeLabLaunchMode,
) => CodeLabLaunchPreparationResult;

export type CodeLabLaunchContextValue = {
  context: CodeLabLaunchContext | null;
  launchMode: CodeLabLaunchMode | null;
  expired: boolean;
  revision: number;
  launch: CodeLabLaunchAction;
  publish: CodeLabLaunchAction;
  consume: () => CodeLabLaunchContext | null;
  clear: () => void;
  acknowledgeExpired: () => void;
};
