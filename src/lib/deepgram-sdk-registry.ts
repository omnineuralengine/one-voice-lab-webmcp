import { z } from "zod";

export const DEEPGRAM_SDK_REGISTRY_VERSION = "deepgram-sdk-registry-v1" as const;
export const DEEPGRAM_SDK_REGISTRY_VERIFIED_AT = "2026-07-28T12:00:00.000Z" as const;

const OFFICIAL_DEEPGRAM_GITHUB_REPOSITORIES = new Set([
  "deepgram-js-sdk",
  "deepgram-python-sdk",
  "deepgram-go-sdk",
  "deepgram-dotnet-sdk",
  "deepgram-java-sdk",
  "deepgram-rust-sdk",
  "recipes",
]);

/**
 * This validator is intentionally narrower than a general-purpose URL allowlist.
 * SDK Doctor sources may point only to Deepgram developer documentation or a
 * known repository owned by the Deepgram GitHub organization.
 */
export function isOfficialDeepgramSdkSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      /%2f|%5c/i.test(url.pathname)
    ) return false;

    if (url.hostname === "developers.deepgram.com") return true;
    if (url.hostname !== "github.com") return false;

    const path = url.pathname.split("/").filter(Boolean);
    return path[0] === "deepgram" && Boolean(path[1]) && OFFICIAL_DEEPGRAM_GITHUB_REPOSITORIES.has(path[1]);
  } catch {
    return false;
  }
}

const officialSourceUrlSchema = z.string().url().refine(
  isOfficialDeepgramSdkSourceUrl,
  "Only allowlisted first-party Deepgram documentation and GitHub sources are accepted",
);

const freshnessStatusSchema = z.enum(["fresh", "stale", "unknown"]);

export const deepgramSdkSourceSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  canonicalUrl: officialSourceUrlSchema,
  sourceType: z.enum(["documentation", "documentation-index", "feature-matrix", "repository", "reference", "release-index", "migration-guide"]),
  authority: z.enum(["official-deepgram-documentation", "first-party-deepgram-repository"]),
  sdkIds: z.array(z.enum(["javascript-typescript", "python", "go", "dotnet", "java", "rust"])).max(6),
  summary: z.string().min(1).max(500),
  retrievedAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime(),
  staleAfterDays: z.number().int().min(1).max(365),
  freshnessStatus: freshnessStatusSchema,
  retrievalMode: z.literal("cached-first-party-snapshot"),
  etag: z.string().max(200).nullable(),
  releaseTag: z.string().max(100).nullable(),
  publishedAt: z.string().datetime().nullable(),
}).strict();

const migrationSourcePatternSchema = z.object({
  fromMajor: z.string().regex(/^\d+\+?$/),
  toMajor: z.string().regex(/^\d+\+?$/),
  sourceId: z.string().min(1).max(120),
  canonicalUrl: officialSourceUrlSchema,
}).strict();

export const deepgramSdkEntrySchema = z.object({
  id: z.enum(["javascript-typescript", "python", "go", "dotnet", "java", "rust"]),
  displayName: z.string().min(1).max(100),
  language: z.enum(["JavaScript / TypeScript", "Python", "Go", ".NET / C#", "Java", "Rust"]),
  packageNames: z.array(z.string().min(1).max(160)).min(1).max(6),
  packageManager: z.enum(["npm-compatible", "pip-compatible", "go-modules", "nuget", "maven-or-gradle", "cargo"]),
  repository: officialSourceUrlSchema,
  documentationRoot: officialSourceUrlSchema,
  referenceRoot: officialSourceUrlSchema,
  releaseSource: officialSourceUrlSchema,
  migrationSourcePatterns: z.array(migrationSourcePatternSchema).max(12),
  supportedManifestTypes: z.array(z.string().min(1).max(80)).min(1).max(16),
  runtimeNotes: z.array(z.string().min(1).max(300)).min(1).max(8),
  supportStatus: z.enum(["official", "community-maintained"]),
  supportStatusSource: officialSourceUrlSchema,
  sourceIds: z.array(z.string().min(1).max(120)).min(1).max(20),
  retrievedAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime(),
  freshnessStatus: freshnessStatusSchema,
}).strict();

export const deepgramSdkRegistrySchema = z.object({
  registryVersion: z.literal(DEEPGRAM_SDK_REGISTRY_VERSION),
  snapshotKind: z.literal("offline-first-party-source-snapshot"),
  retrievedAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime(),
  freshnessStatus: freshnessStatusSchema,
  staleAfterPolicy: z.object({
    defaultDays: z.number().int().min(1).max(365),
    featureMatrixDays: z.number().int().min(1).max(365),
    releaseIndexDays: z.number().int().min(1).max(365),
    behaviorWhenStale: z.string().min(1).max(500),
  }).strict(),
  sources: z.array(deepgramSdkSourceSchema).min(1).max(80),
  sdks: z.array(deepgramSdkEntrySchema).length(6),
}).strict().superRefine((registry, context) => {
  const sourceIds = new Set<string>();
  for (const [index, source] of registry.sources.entries()) {
    if (sourceIds.has(source.id)) {
      context.addIssue({ code: "custom", message: `Duplicate source id: ${source.id}`, path: ["sources", index, "id"] });
    }
    sourceIds.add(source.id);
  }

  const sdkIds = new Set<string>();
  const packageNames = new Set<string>();
  for (const [index, sdk] of registry.sdks.entries()) {
    if (sdkIds.has(sdk.id)) {
      context.addIssue({ code: "custom", message: `Duplicate SDK id: ${sdk.id}`, path: ["sdks", index, "id"] });
    }
    sdkIds.add(sdk.id);

    for (const packageName of sdk.packageNames) {
      const normalized = `${sdk.packageManager}:${packageName.toLowerCase()}`;
      if (packageNames.has(normalized)) {
        context.addIssue({ code: "custom", message: `Duplicate package name: ${packageName}`, path: ["sdks", index, "packageNames"] });
      }
      packageNames.add(normalized);
    }

    for (const sourceId of sdk.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        context.addIssue({ code: "custom", message: `Unknown source id: ${sourceId}`, path: ["sdks", index, "sourceIds"] });
      }
    }
    for (const [migrationIndex, migration] of sdk.migrationSourcePatterns.entries()) {
      const source = registry.sources.find((candidate) => candidate.id === migration.sourceId);
      if (!source || source.sourceType !== "migration-guide" || source.canonicalUrl !== migration.canonicalUrl) {
        context.addIssue({ code: "custom", message: `Invalid migration source: ${migration.sourceId}`, path: ["sdks", index, "migrationSourcePatterns", migrationIndex] });
      }
    }
  }
});

export type DeepgramSdkSource = z.infer<typeof deepgramSdkSourceSchema>;
export type DeepgramSdkEntry = z.infer<typeof deepgramSdkEntrySchema>;
export type DeepgramSdkRegistry = z.infer<typeof deepgramSdkRegistrySchema>;
export type DeepgramSdkFreshness = z.infer<typeof freshnessStatusSchema>;

const VERIFIED_AT = DEEPGRAM_SDK_REGISTRY_VERIFIED_AT;

function source(
  id: string,
  title: string,
  canonicalUrl: string,
  sourceType: DeepgramSdkSource["sourceType"],
  authority: DeepgramSdkSource["authority"],
  sdkIds: DeepgramSdkSource["sdkIds"],
  summary: string,
  staleAfterDays = 30,
): DeepgramSdkSource {
  return {
    id,
    title,
    canonicalUrl,
    sourceType,
    authority,
    sdkIds,
    summary,
    retrievedAt: VERIFIED_AT,
    lastVerifiedAt: VERIFIED_AT,
    staleAfterDays,
    freshnessStatus: "fresh",
    retrievalMode: "cached-first-party-snapshot",
    etag: null,
    releaseTag: null,
    publishedAt: null,
  };
}

const commonSources: DeepgramSdkSource[] = [
  source("docs-sdk-feature-matrix", "SDK Feature Matrix", "https://developers.deepgram.com/sdks/sdk-features", "feature-matrix", "official-deepgram-documentation", ["javascript-typescript", "python", "go", "dotnet", "java", "rust"], "Current first-party matrix for SDK feature availability. Absence from the cached matrix is not proof that the underlying API lacks the feature.", 7),
  source("docs-agentic-tools", "Agentic developer tools", "https://developers.deepgram.com/developer-tools/agentic-tools", "documentation", "official-deepgram-documentation", ["javascript-typescript", "python", "go", "dotnet", "java", "rust"], "First-party guidance for Deepgram documentation and agentic retrieval tools."),
  source("docs-self-hosted-sdks", "Using SDKs with Self-Hosted", "https://developers.deepgram.com/docs/using-sdks-with-self-hosted", "documentation", "official-deepgram-documentation", ["javascript-typescript", "python", "go", "dotnet", "java", "rust"], "Version-sensitive first-party guidance for configuring SDK endpoint environments for self-hosted deployments.", 14),
  source("docs-custom-endpoints", "Configuring Custom Endpoints", "https://developers.deepgram.com/reference/custom-endpoints", "documentation", "official-deepgram-documentation", ["javascript-typescript", "python", "go", "dotnet", "java", "rust"], "First-party endpoint override guidance. Consult the installed SDK generation before applying an example.", 14),
  source("docs-llms-index", "Deepgram documentation index", "https://developers.deepgram.com/llms.txt", "documentation-index", "official-deepgram-documentation", ["javascript-typescript", "python", "go", "dotnet", "java", "rust"], "Machine-readable index for discovering current Deepgram documentation; cached metadata must be refreshed before current-version claims.", 7),
  source("repo-recipes", "Deepgram recipes", "https://github.com/deepgram/recipes", "repository", "first-party-deepgram-repository", ["javascript-typescript", "python", "go", "dotnet", "java", "rust"], "Maintained first-party examples. Version-matched references and migration guides remain stronger authority for installed-version syntax."),
];

const javascriptSources: DeepgramSdkSource[] = [
  source("repo-javascript", "Deepgram JavaScript SDK", "https://github.com/deepgram/deepgram-js-sdk", "repository", "first-party-deepgram-repository", ["javascript-typescript"], "First-party JavaScript and TypeScript SDK repository."),
  source("reference-javascript", "JavaScript SDK reference", "https://github.com/deepgram/deepgram-js-sdk/blob/main/reference.md", "reference", "first-party-deepgram-repository", ["javascript-typescript"], "Generated current-branch JavaScript SDK reference; use a matching tag for an installed older version.", 14),
  source("releases-javascript", "JavaScript SDK releases", "https://github.com/deepgram/deepgram-js-sdk/releases", "release-index", "first-party-deepgram-repository", ["javascript-typescript"], "First-party release history. This snapshot intentionally does not label any release as eternally latest.", 2),
  source("migration-javascript-2-3", "JavaScript SDK migration: v2 to v3", "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v2-to-v3.md", "migration-guide", "first-party-deepgram-repository", ["javascript-typescript"], "First-party migration guide for the JavaScript SDK v2-to-v3 transition."),
  source("migration-javascript-3-4", "JavaScript SDK migration: v3 to v4", "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v3-to-v4.md", "migration-guide", "first-party-deepgram-repository", ["javascript-typescript"], "First-party migration guide for the JavaScript SDK v3-to-v4 transition."),
  source("migration-javascript-4-5", "JavaScript SDK migration: v4 to v5", "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v4-to-v5.md", "migration-guide", "first-party-deepgram-repository", ["javascript-typescript"], "First-party migration guide for the JavaScript SDK v4-to-v5 transition."),
];

const pythonSources: DeepgramSdkSource[] = [
  source("repo-python", "Deepgram Python SDK", "https://github.com/deepgram/deepgram-python-sdk", "repository", "first-party-deepgram-repository", ["python"], "First-party Python SDK repository."),
  source("reference-python", "Python SDK reference", "https://github.com/deepgram/deepgram-python-sdk/blob/main/reference.md", "reference", "first-party-deepgram-repository", ["python"], "Generated current-branch Python SDK reference; use a matching tag for an installed older version.", 14),
  source("releases-python", "Python SDK releases", "https://github.com/deepgram/deepgram-python-sdk/releases", "release-index", "first-party-deepgram-repository", ["python"], "First-party release history. This snapshot intentionally does not label any release as eternally latest.", 2),
  source("migration-python-2-3", "Python SDK migration: v2 to v3+", "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v2-to-v3.md", "migration-guide", "first-party-deepgram-repository", ["python"], "First-party migration guide for the Python SDK v2-to-v3+ transition."),
  source("migration-python-3-5", "Python SDK migration: v3+ to v5", "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v3-to-v5.md", "migration-guide", "first-party-deepgram-repository", ["python"], "First-party migration guide for the Python SDK v3+-to-v5 transition."),
  source("migration-python-5-6", "Python SDK migration: v5 to v6", "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v5-to-v6.md", "migration-guide", "first-party-deepgram-repository", ["python"], "First-party migration guide for the Python SDK v5-to-v6 transition."),
  source("migration-python-6-7", "Python SDK migration: v6 to v7", "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v6-to-v7.md", "migration-guide", "first-party-deepgram-repository", ["python"], "First-party migration guide for the Python SDK v6-to-v7 transition."),
];

const otherSdkSources: DeepgramSdkSource[] = [
  source("repo-go", "Deepgram Go SDK", "https://github.com/deepgram/deepgram-go-sdk", "repository", "first-party-deepgram-repository", ["go"], "First-party Go SDK repository."),
  source("releases-go", "Go SDK releases", "https://github.com/deepgram/deepgram-go-sdk/releases", "release-index", "first-party-deepgram-repository", ["go"], "First-party Go SDK release history; refresh before making current-release claims.", 2),
  source("repo-dotnet", "Deepgram .NET SDK", "https://github.com/deepgram/deepgram-dotnet-sdk", "repository", "first-party-deepgram-repository", ["dotnet"], "First-party .NET SDK repository."),
  source("releases-dotnet", ".NET SDK releases", "https://github.com/deepgram/deepgram-dotnet-sdk/releases", "release-index", "first-party-deepgram-repository", ["dotnet"], "First-party .NET SDK release history; refresh before making current-release claims.", 2),
  source("repo-java", "Deepgram Java SDK", "https://github.com/deepgram/deepgram-java-sdk", "repository", "first-party-deepgram-repository", ["java"], "First-party Java SDK repository."),
  source("releases-java", "Java SDK releases", "https://github.com/deepgram/deepgram-java-sdk/releases", "release-index", "first-party-deepgram-repository", ["java"], "First-party Java SDK release history; refresh before making current-release claims.", 2),
  source("repo-rust", "Deepgram Rust SDK", "https://github.com/deepgram/deepgram-rust-sdk", "repository", "first-party-deepgram-repository", ["rust"], "Deepgram-owned repository that explicitly describes the Rust SDK as community-maintained."),
  source("releases-rust", "Rust SDK releases", "https://github.com/deepgram/deepgram-rust-sdk/releases", "release-index", "first-party-deepgram-repository", ["rust"], "Deepgram-owned Rust SDK release history; refresh before making current-release claims.", 2),
  source("changelog-sdk-releases-2026-05-12", "Deepgram SDK releases — May 12, 2026", "https://developers.deepgram.com/changelog/2026/5/12", "documentation", "official-deepgram-documentation", ["javascript-typescript", "python", "java", "rust"], "First-party release note that includes Rust Flux multilingual support, which may be fresher than a conflicting SDK Feature Matrix row.", 30),
];

const allSources = [...commonSources, ...javascriptSources, ...pythonSources, ...otherSdkSources];
const commonSourceIds = commonSources.map((item) => item.id);

const rawRegistry = {
  registryVersion: DEEPGRAM_SDK_REGISTRY_VERSION,
  snapshotKind: "offline-first-party-source-snapshot",
  retrievedAt: VERIFIED_AT,
  lastVerifiedAt: VERIFIED_AT,
  freshnessStatus: "fresh",
  staleAfterPolicy: {
    defaultDays: 30,
    featureMatrixDays: 7,
    releaseIndexDays: 2,
    behaviorWhenStale: "Continue installed-version diagnosis from customer evidence, label current-release and feature comparisons potentially stale, and request a server-side first-party source refresh before making current-state claims.",
  },
  sources: allSources,
  sdks: [
    {
      id: "javascript-typescript",
      displayName: "Deepgram JavaScript SDK",
      language: "JavaScript / TypeScript",
      packageNames: ["@deepgram/sdk"],
      packageManager: "npm-compatible",
      repository: "https://github.com/deepgram/deepgram-js-sdk",
      documentationRoot: "https://github.com/deepgram/deepgram-js-sdk",
      referenceRoot: "https://github.com/deepgram/deepgram-js-sdk/blob/main/reference.md",
      releaseSource: "https://github.com/deepgram/deepgram-js-sdk/releases",
      migrationSourcePatterns: [
        { fromMajor: "2", toMajor: "3", sourceId: "migration-javascript-2-3", canonicalUrl: "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v2-to-v3.md" },
        { fromMajor: "3", toMajor: "4", sourceId: "migration-javascript-3-4", canonicalUrl: "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v3-to-v4.md" },
        { fromMajor: "4", toMajor: "5", sourceId: "migration-javascript-4-5", canonicalUrl: "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v4-to-v5.md" },
      ],
      supportedManifestTypes: ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "npm list output", "pnpm list output", "yarn why output"],
      runtimeNotes: ["Resolve the installed package before selecting an SDK generation.", "Browser and server authentication boundaries must be diagnosed separately; do not place long-lived API keys in client code."],
      supportStatus: "official",
      supportStatusSource: "https://github.com/deepgram/deepgram-js-sdk",
      sourceIds: [...commonSourceIds, ...javascriptSources.map((item) => item.id)],
      retrievedAt: VERIFIED_AT,
      lastVerifiedAt: VERIFIED_AT,
      freshnessStatus: "fresh",
    },
    {
      id: "python",
      displayName: "Deepgram Python SDK",
      language: "Python",
      packageNames: ["deepgram-sdk"],
      packageManager: "pip-compatible",
      repository: "https://github.com/deepgram/deepgram-python-sdk",
      documentationRoot: "https://github.com/deepgram/deepgram-python-sdk",
      referenceRoot: "https://github.com/deepgram/deepgram-python-sdk/blob/main/reference.md",
      releaseSource: "https://github.com/deepgram/deepgram-python-sdk/releases",
      migrationSourcePatterns: [
        { fromMajor: "2", toMajor: "3+", sourceId: "migration-python-2-3", canonicalUrl: "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v2-to-v3.md" },
        { fromMajor: "3+", toMajor: "5", sourceId: "migration-python-3-5", canonicalUrl: "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v3-to-v5.md" },
        { fromMajor: "5", toMajor: "6", sourceId: "migration-python-5-6", canonicalUrl: "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v5-to-v6.md" },
        { fromMajor: "6", toMajor: "7", sourceId: "migration-python-6-7", canonicalUrl: "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v6-to-v7.md" },
      ],
      supportedManifestTypes: ["pyproject.toml", "requirements.txt", "requirements-dev.txt", "poetry.lock", "Pipfile", "Pipfile.lock", "pip freeze output", "uv.lock"],
      runtimeNotes: ["Use lockfile or installed-package output before manifest constraints.", "Diagnose synchronous and asynchronous clients and event-loop ownership separately."],
      supportStatus: "official",
      supportStatusSource: "https://github.com/deepgram/deepgram-python-sdk",
      sourceIds: [...commonSourceIds, ...pythonSources.map((item) => item.id)],
      retrievedAt: VERIFIED_AT,
      lastVerifiedAt: VERIFIED_AT,
      freshnessStatus: "fresh",
    },
    {
      id: "go",
      displayName: "Deepgram Go SDK",
      language: "Go",
      packageNames: ["github.com/deepgram/deepgram-go-sdk/v3", "github.com/deepgram/deepgram-go-sdk"],
      packageManager: "go-modules",
      repository: "https://github.com/deepgram/deepgram-go-sdk",
      documentationRoot: "https://github.com/deepgram/deepgram-go-sdk",
      referenceRoot: "https://github.com/deepgram/deepgram-go-sdk/blob/main/docs.go",
      releaseSource: "https://github.com/deepgram/deepgram-go-sdk/releases",
      migrationSourcePatterns: [],
      supportedManifestTypes: ["go.mod", "go.sum", "go list -m output"],
      runtimeNotes: ["The module path may contain a semantic import-version suffix; preserve the exact resolved module path.", "Context cancellation, goroutine lifetime, and connection close behavior are runtime evidence rather than package-version evidence."],
      supportStatus: "official",
      supportStatusSource: "https://github.com/deepgram/deepgram-go-sdk",
      sourceIds: [...commonSourceIds, "repo-go", "releases-go"],
      retrievedAt: VERIFIED_AT,
      lastVerifiedAt: VERIFIED_AT,
      freshnessStatus: "fresh",
    },
    {
      id: "dotnet",
      displayName: "Deepgram .NET SDK",
      language: ".NET / C#",
      packageNames: ["Deepgram"],
      packageManager: "nuget",
      repository: "https://github.com/deepgram/deepgram-dotnet-sdk",
      documentationRoot: "https://github.com/deepgram/deepgram-dotnet-sdk",
      referenceRoot: "https://github.com/deepgram/deepgram-dotnet-sdk",
      releaseSource: "https://github.com/deepgram/deepgram-dotnet-sdk/releases",
      migrationSourcePatterns: [],
      supportedManifestTypes: [".csproj", "Directory.Packages.props", "packages.lock.json", "dotnet list package output"],
      runtimeNotes: ["Target framework, dependency-injection lifetime, async disposal, and WebSocket ownership materially affect integration behavior."],
      supportStatus: "official",
      supportStatusSource: "https://github.com/deepgram/deepgram-dotnet-sdk",
      sourceIds: [...commonSourceIds, "repo-dotnet", "releases-dotnet"],
      retrievedAt: VERIFIED_AT,
      lastVerifiedAt: VERIFIED_AT,
      freshnessStatus: "fresh",
    },
    {
      id: "java",
      displayName: "Deepgram Java SDK",
      language: "Java",
      packageNames: ["com.deepgram:deepgram-java-sdk"],
      packageManager: "maven-or-gradle",
      repository: "https://github.com/deepgram/deepgram-java-sdk",
      documentationRoot: "https://github.com/deepgram/deepgram-java-sdk",
      referenceRoot: "https://github.com/deepgram/deepgram-java-sdk",
      releaseSource: "https://github.com/deepgram/deepgram-java-sdk/releases",
      migrationSourcePatterns: [],
      supportedManifestTypes: ["pom.xml", "build.gradle", "build.gradle.kts", "gradle.lockfile", "Maven dependency-tree output", "Gradle dependency output"],
      runtimeNotes: ["Resolve the Maven or Gradle dependency before selecting builder, callback, or WebSocket syntax.", "Resource lifetime and asynchronous completion are separate from SDK feature availability."],
      supportStatus: "official",
      supportStatusSource: "https://github.com/deepgram/deepgram-java-sdk",
      sourceIds: [...commonSourceIds, "repo-java", "releases-java"],
      retrievedAt: VERIFIED_AT,
      lastVerifiedAt: VERIFIED_AT,
      freshnessStatus: "fresh",
    },
    {
      id: "rust",
      displayName: "Deepgram Rust SDK",
      language: "Rust",
      packageNames: ["deepgram"],
      packageManager: "cargo",
      repository: "https://github.com/deepgram/deepgram-rust-sdk",
      documentationRoot: "https://github.com/deepgram/deepgram-rust-sdk",
      referenceRoot: "https://github.com/deepgram/deepgram-rust-sdk",
      releaseSource: "https://github.com/deepgram/deepgram-rust-sdk/releases",
      migrationSourcePatterns: [],
      supportedManifestTypes: ["Cargo.toml", "Cargo.lock", "cargo tree output"],
      runtimeNotes: ["Preserve the repository's community-maintained designation.", "Tokio features, async ownership, and stream lifetime require project evidence before diagnosis."],
      supportStatus: "community-maintained",
      supportStatusSource: "https://github.com/deepgram/deepgram-rust-sdk",
      sourceIds: [...commonSourceIds, "repo-rust", "releases-rust", "changelog-sdk-releases-2026-05-12"],
      retrievedAt: VERIFIED_AT,
      lastVerifiedAt: VERIFIED_AT,
      freshnessStatus: "fresh",
    },
  ],
};

export const DEEPGRAM_SDK_REGISTRY: DeepgramSdkRegistry = deepgramSdkRegistrySchema.parse(rawRegistry);

export const deepgramSdkFeatureSupportSchema = z.object({
  language: z.enum(["javascript-typescript", "python", "go", "dotnet", "java", "rust"]),
  product: z.enum(["listen-prerecorded", "listen-v1-streaming", "listen-v2-flux", "speak-rest", "speak-streaming", "voice-agent", "read-text-intelligence", "manage", "auth", "self-hosted-management"]),
  status: z.enum(["listed", "partially-listed", "not-listed", "conflicting-first-party-sources", "unknown"]),
  sourceIds: z.array(z.string().min(1).max(120)).min(1).max(4),
  verifiedAt: z.string().datetime(),
  note: z.string().min(1).max(500),
}).strict();

export type DeepgramSdkFeatureSupport = z.infer<typeof deepgramSdkFeatureSupportSchema>;

const FEATURE_LANGUAGES = ["javascript-typescript", "python", "go", "dotnet", "java", "rust"] as const;
const FEATURE_MATRIX_SOURCE = "docs-sdk-feature-matrix";
const featureSupportEntries: DeepgramSdkFeatureSupport[] = [
  ...(["listen-prerecorded", "listen-v1-streaming", "speak-rest"] as const).flatMap((product) => FEATURE_LANGUAGES.map((language) => ({ language, product, status: "listed" as const, sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The cached official SDK Feature Matrix lists this SDK for the product family; verify each extracted option against its exact row." }))),
  ...(["javascript-typescript", "python", "dotnet", "java"] as const).map((language) => ({ language, product: "listen-v2-flux" as const, status: "listed" as const, sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The cached official SDK Feature Matrix lists this SDK for Listen v2 / Flux." })),
  { language: "go", product: "listen-v2-flux", status: "not-listed", sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The cached Feature Matrix does not list Go for Flux. This is not proof that the API lacks the capability; verify current SDK or direct WebSocket guidance." },
  { language: "rust", product: "listen-v2-flux", status: "conflicting-first-party-sources", sourceIds: [FEATURE_MATRIX_SOURCE, "changelog-sdk-releases-2026-05-12"], verifiedAt: VERIFIED_AT, note: "The cached Feature Matrix omits Rust, while a newer first-party changelog describes Rust Flux multilingual support. Do not merge these claims silently; verify the installed crate and current matrix." },
  ...(["javascript-typescript", "python", "go", "dotnet", "java"] as const).flatMap((language) => (["speak-streaming", "voice-agent"] as const).map((product) => ({ language, product, status: "listed" as const, sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The cached official SDK Feature Matrix lists this SDK for the product family." }))),
  ...(["speak-streaming", "voice-agent"] as const).map((product) => ({ language: "rust" as const, product, status: "not-listed" as const, sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The cached Feature Matrix does not list Rust for this product family. This does not establish API-level unavailability." })),
  ...FEATURE_LANGUAGES.flatMap((language) => (["read-text-intelligence", "manage"] as const).map((product) => ({ language, product, status: "partially-listed" as const, sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The matrix lists many operations for this SDK, but availability varies by exact operation or option; inspect the matching row." }))),
  ...FEATURE_LANGUAGES.flatMap((language) => (["auth", "self-hosted-management"] as const).map((product) => ({ language, product, status: "unknown" as const, sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "The cached product-level snapshot is insufficient; use version-matched SDK and deployment documentation." }))),
].map((entry) => deepgramSdkFeatureSupportSchema.parse(entry));

export function getDeepgramSdkFeatureSupport(language: DeepgramSdkFeatureSupport["language"], product: DeepgramSdkFeatureSupport["product"]): DeepgramSdkFeatureSupport {
  return featureSupportEntries.find((entry) => entry.language === language && entry.product === product)
    ?? deepgramSdkFeatureSupportSchema.parse({ language, product, status: "unknown", sourceIds: [FEATURE_MATRIX_SOURCE], verifiedAt: VERIFIED_AT, note: "No normalized product-level snapshot entry is available; verify the exact current matrix row." });
}

function cleanPackageName(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function findDeepgramSdkByPackage(packageName: string): DeepgramSdkEntry | null {
  const cleaned = cleanPackageName(packageName);
  const candidates = DEEPGRAM_SDK_REGISTRY.sdks.flatMap((sdk) => sdk.packageNames.map((name) => ({ sdk, name })))
    .sort((left, right) => right.name.length - left.name.length);

  const caseSensitiveMatch = candidates.find(({ name }) => (
    cleaned === name || cleaned.startsWith(`${name}/`) || cleaned.startsWith(`${name}:`)
  ));
  if (caseSensitiveMatch) return caseSensitiveMatch.sdk;

  const normalized = cleaned.toLowerCase();
  return candidates.find(({ name }) => {
    const candidate = name.toLowerCase();
    return normalized === candidate || normalized.startsWith(`${candidate}/`) || normalized.startsWith(`${candidate}:`);
  })?.sdk ?? null;
}

export function getDeepgramSdkById(id: string): DeepgramSdkEntry | null {
  return DEEPGRAM_SDK_REGISTRY.sdks.find((sdk) => sdk.id === id) ?? null;
}

function normalizedMajor(value: string | number): string {
  return String(value).trim().toLowerCase().replace(/^v/, "").replace(/\+$/, "").split(".")[0];
}

export function selectDeepgramSdkMigrationSources(
  sdkId: string,
  fromMajor: string | number,
  toMajor: string | number,
): DeepgramSdkSource[] {
  const sdk = getDeepgramSdkById(sdkId);
  if (!sdk) return [];

  const from = normalizedMajor(fromMajor);
  const to = normalizedMajor(toMajor);
  const sourceIds = new Set(sdk.migrationSourcePatterns
    .filter((pattern) => normalizedMajor(pattern.fromMajor) === from && normalizedMajor(pattern.toMajor) === to)
    .map((pattern) => pattern.sourceId));

  return DEEPGRAM_SDK_REGISTRY.sources.filter((candidate) => sourceIds.has(candidate.id));
}

function asDate(value: Date | string): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getDeepgramSdkSourceFreshness(
  sourceValue: Pick<DeepgramSdkSource, "lastVerifiedAt" | "staleAfterDays">,
  asOf: Date | string = new Date(),
): DeepgramSdkFreshness {
  const verifiedAt = asDate(sourceValue.lastVerifiedAt);
  const reference = asDate(asOf);
  if (!verifiedAt || !reference) return "unknown";

  const ageInDays = Math.max(0, reference.getTime() - verifiedAt.getTime()) / 86_400_000;
  return ageInDays <= sourceValue.staleAfterDays ? "fresh" : "stale";
}

export function getDeepgramSdkRegistryFreshness(asOf: Date | string = new Date()): DeepgramSdkFreshness {
  const statuses = DEEPGRAM_SDK_REGISTRY.sources.map((item) => getDeepgramSdkSourceFreshness(item, asOf));
  if (statuses.some((status) => status === "stale")) return "stale";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  return "fresh";
}
