import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import {
  checkLabAccess,
  labAccessResponse,
  minimumTierInProduction,
  reserveLabConcurrencyLease,
  type LabConcurrencyReservation,
} from "@/lib/access/lab-access";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { solutionCaseBundleSchema } from "@/types/live-solution-case";
import type { SolutionCaseBundle } from "@/types/live-solution-case";
import {
  deliverableArtifactSchema,
  deliverableManualEditsSchema,
  deliverableProfileSchema,
  deliverableProjectSchema,
  deliverableSectionSchema,
} from "@/types/solution-deliverables";
import type { DeliverableManualEdits } from "@/types/solution-deliverables";
import {
  assessDeliverableReadiness,
  auditMermaidEdit,
  auditDeliverableManualEdits,
  buildBriefMarkdown,
  buildPresentationStoryboard,
  buildRedactedDeliverableCase,
  buildSolutionNarrative,
  buildSourceManifest,
  DELIVERABLE_GENERATOR_VERSION,
  describeMermaid,
  generateMermaid,
  mermaidToSafeSvg,
  narrativeSourceItemIds,
  safeMarkdownProse,
  safeName,
  safeStem,
  scanDeliverableText,
  sanitizeDeliverableManualEdits,
  validateMermaid,
} from "@/lib/solution-deliverables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 2_000_000;
const MAX_PACK_FILES = 20;
const MAX_ARTIFACT_BYTES = 12_000_000;
const MAX_PACK_BYTES = 30_000_000;
const MAX_RESPONSE_BINARY_BYTES = 50_000_000;
const sha = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const binary = (data: Uint8Array) => Buffer.from(data).toString("base64");
const BRAND_MARK_PATH = join(process.cwd(), "public", "brand", "one-voice-lab-logo.png");

export async function POST(request: Request) {
  let concurrency: LabConcurrencyReservation | null = null;
  try {
    const text = await readBoundedRequestText(request, MAX_BODY);
    const body = JSON.parse(text) as Record<string, unknown>;
    const parsed = solutionCaseBundleSchema.safeParse(body.caseBundle);
    const profile = deliverableProfileSchema.safeParse(body.profile);
    const manualEdits = deliverableManualEditsSchema.safeParse(
      body.manualEdits ?? {},
    );
    if (!parsed.success || !profile.success || !manualEdits.success)
      return NextResponse.json(
        {
          error:
            "Validated case, deliverable profile, and bounded edits are required.",
        },
        { status: 400 },
      );
    const bundle = parsed.data as unknown as SolutionCaseBundle;
    const customer = safeName(String(body.customerDisplayName ?? "Customer")),
      stem = safeStem(customer),
      now = new Date().toISOString();
    const edits = sanitizeDeliverableManualEdits(manualEdits.data);
    const wordingAudit = auditDeliverableManualEdits(bundle, manualEdits.data);
    if (wordingAudit.status === "blocked")
      return NextResponse.json(
        { error: wordingAudit.message, editAudit: wordingAudit },
        { status: 422 },
      );
    const generatedMermaid = generateMermaid(bundle, profile.data);
    const requestedMermaid =
      typeof body.mermaidSource === "string"
        ? body.mermaidSource.slice(0, 20_000)
        : generatedMermaid.source;
    const mermaidValidation = validateMermaid(requestedMermaid);
    if (
      containsProhibitedExportText(requestedMermaid) ||
      !mermaidValidation.valid
    )
      return NextResponse.json(
        {
          error: "Mermaid failed strict validation.",
          details: mermaidValidation.errors,
        },
        { status: 422 },
      );
    const mermaidUserEdited = requestedMermaid !== generatedMermaid.source;
    const mermaidAudit = auditMermaidEdit(
      generatedMermaid.source,
      requestedMermaid,
    );
    const editAudit = combineEditAudits(wordingAudit, mermaidAudit);
    const readiness = withManualEditReadiness(
      assessDeliverableReadiness(bundle, profile.data),
      editAudit,
    );
    const accessContext = {
      endpointId: "deliverables:generate",
      minimumTier: minimumTierInProduction("verified"),
      actorIntent: "human" as const,
      durableRequired: process.env.NODE_ENV === "production",
    };
    const access = await checkLabAccess(request, "deliverable_generation", accessContext);
    if (!access.allowed) return labAccessResponse(access);
    concurrency = await reserveLabConcurrencyLease(request, "deliverable_generation", accessContext);
    if (!concurrency.decision.allowed) return labAccessResponse(concurrency.decision);

    const brandMark = await readFile(BRAND_MARK_PATH);
    const brandDataUrl = `data:image/png;base64,${brandMark.toString("base64")}`;
    const svg = mermaidToSafeSvg(requestedMermaid, brandDataUrl);
    const architectureDescription = describeMermaid(requestedMermaid);
    const generatedBrief = buildBriefMarkdown(bundle, profile.data, customer, edits);
    const brief = {
      ...generatedBrief,
      markdown: `${generatedBrief.markdown.trim()}\n\n---\n\n![ONE Voice Lab](https://one-voice-lab.vercel.app/brand/one-voice-lab-logo.png)\n\nGenerated by [ONE Voice Lab](https://one-voice-lab.vercel.app) · Omni Neural Engine. Human review required before sharing.\n`,
    };
    const pdfTitle = edits.title || `${customer} — Technical Solution Brief`;
    const pdfSize = String(body.pageSize) === "A4" ? "A4" : "Letter";
    const pdfResult = await createOnePagePdf(
      pdfTitle,
      brief.markdown,
      pdfSize,
      requestedMermaid,
      brandMark,
    );
    const pdfValidation = await validatePdf(pdfResult.bytes, {
      title: pdfTitle,
      size: pdfSize,
      layout: pdfResult.layout,
    });
    if (!pdfValidation.valid)
      return NextResponse.json(
        {
          error: "One-page PDF validation failed.",
          details: pdfValidation.errors,
        },
        { status: 422 },
      );
    const storyboard = buildPresentationStoryboard(
      bundle,
      profile.data,
      customer,
      body.presentationType === "technical"
        ? "technical"
        : body.presentationType === "poc"
          ? "poc"
          : "product",
      edits,
    );
    const pptx = await createPptx(storyboard, readiness.state, brandDataUrl);
    const pptxValidation = await validatePptx(
      pptx,
      storyboard.slides.length,
      storyboard.slides.map((slide) => slide.title),
      storyboard,
    );
    if (!pptxValidation.valid)
      return NextResponse.json(
        {
          error: "PowerPoint validation failed.",
          details: pptxValidation.errors,
        },
        { status: 422 },
      );
    const projectId = `deliverable-${crypto.randomUUID()}`;
    const sources = buildSourceManifest(bundle, profile.data, edits);
    const editedArtifactTypes = manualEditArtifactTypes(
      edits,
      mermaidUserEdited,
    );
    const narrativeIds = narrativeSourceItemIds(
      buildSolutionNarrative(bundle, profile.data),
    );
    const presentationIds = [
      ...new Set(
        [
          ...storyboard.slides.flatMap((slide) =>
            slide.bullets.flatMap((bullet) => bullet.sourceItemIds),
          ),
          ...storyboard.architectureFlow.flatMap(
            (node) => node.sourceItemIds,
          ),
        ],
      ),
    ];
    const sourceManifestIds = [
      ...new Set(sources.flatMap((source) => source.claimIds)),
    ];
    const internalReviewerIds = narrativeSourceItemIds(
      buildSolutionNarrative(bundle, "internal-solution-review"),
    );
    const projectSourceItemIds = [
      ...new Set([
        ...narrativeIds,
        ...presentationIds,
        ...generatedMermaid.sourceItemIds,
        ...sourceManifestIds,
      ]),
    ];
    const sourceItemIdsByType: Record<string, string[]> = {
      mermaid: generatedMermaid.sourceItemIds,
      svg: generatedMermaid.sourceItemIds,
      "brief-markdown": narrativeIds,
      "brief-pdf": narrativeIds,
      "presentation-pptx": presentationIds,
      "presentation-storyboard": presentationIds,
      "speaker-notes": presentationIds,
      "source-manifest": sourceManifestIds,
      "internal-reviewer-brief": internalReviewerIds,
      "solution-pack": projectSourceItemIds,
    };
    for (const source of sources)
      source.artifactIds = Object.entries(sourceItemIdsByType)
        .filter(
          ([type, itemIds]) =>
            type === "source-manifest" ||
            type === "solution-pack" ||
            (source.sourceType === "user-edit" &&
              editedArtifactTypes.has(type)) ||
            source.claimIds.some((id) => itemIds.includes(id)),
        )
        .map(([type]) => artifactRecordId(type, bundle.case.revision, projectId));
    const sourceJson = JSON.stringify(
      {
        schemaVersion: "solution-deliverables-v1",
        generatedAt: now,
        caseId: bundle.case.id,
        caseRevision: bundle.case.revision,
        references: sources,
      },
      null,
      2,
    );
    const storyboardMd = `# ${safeMarkdownProse(storyboard.title, 180)}\n\n${storyboard.slides.map((s, i) => `## ${i + 1}. ${safeMarkdownProse(s.title, 180)}\n\n${s.bullets.map((b) => `- ${safeMarkdownProse(b.text, 600)}`).join("\n")}`).join("\n\n")}\n\n_${safeMarkdownProse(storyboard.disclaimer, 240)}_\n`;
    const notesMd = `# Speaker notes and provenance\n\n${storyboard.slides.map((s, i) => `## ${i + 1}. ${s.title}\n${[
      ...s.bullets.map(
        (b) =>
          `- Statement sources: ${b.sourceItemIds.join(", ") || "No supporting item — review"}`,
      ),
      ...(s.presentationRole === "architecture"
        ? [
            `- Architecture flow sources: ${[
              ...new Set(
                storyboard.architectureFlow.flatMap(
                  (node) => node.sourceItemIds,
                ),
              ),
            ].join(", ") || "No supporting item — review"}`,
          ]
        : []),
    ].join("\n")}`).join("\n\n")}\n`;
    const internalReviewer = buildBriefMarkdown(
      bundle,
      "internal-solution-review",
      customer,
    ).markdown;
    const contentFiles = [
      file(
        `architecture/${stem}-solution-architecture.mmd`,
        requestedMermaid,
        "text/plain",
      ),
      file(
        `architecture/${stem}-solution-architecture.svg`,
        svg,
        "image/svg+xml",
      ),
      file(
        "architecture/architecture-description.md",
        architectureDescription,
        "text/markdown",
      ),
      file(
        `brief/${stem}-technical-solution-brief.md`,
        brief.markdown,
        "text/markdown",
      ),
      file(
        `brief/${stem}-technical-solution-brief.pdf`,
        pdfResult.bytes,
        "application/pdf",
      ),
      file(
        `presentation/${stem}-client-solution-presentation.pptx`,
        pptx,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
      file(
        "presentation/presentation-storyboard.md",
        storyboardMd,
        "text/markdown",
      ),
      file("presentation/speaker-notes.md", notesMd, "text/markdown"),
      file(
        "evidence/sources.md",
        sources
          .map(
            (s, i) =>
              `${i + 1}. ${safeMarkdownProse(s.title, 300)}${s.canonicalUrl ? ` — ${s.canonicalUrl}` : ""} (${s.authority}; ${s.freshnessState})`,
          )
          .join("\n"),
        "text/markdown",
      ),
      file("evidence/source-manifest.json", sourceJson, "application/json"),
    ];
    if (body.includeRedactedCase === true)
      contentFiles.push(
        file(
          "case/redacted-solution-case.json",
          JSON.stringify(
            buildRedactedDeliverableCase(bundle, profile.data),
            null,
            2,
          ),
          "application/json",
        ),
      );
    const readme = `# ${safeMarkdownProse(customer, 100)} Customer Solution Pack\n\nGenerated from case revision ${bundle.case.revision}. Readiness: **${readiness.state}**.\n\n- Architecture: editable Mermaid, sanitized SVG, and accessible description.\n- Brief: one-page PDF plus editable Markdown.\n- Presentation: editable PowerPoint plus storyboard and source notes.\n- Evidence: concise source list and provenance manifest.\n\nNo raw transcript, audio, credentials, hidden files, or Git metadata is included. Review open questions and freshness before sharing.\n\nCommunity-built solution artifact. Not official Deepgram material.\n`;
    const readmeFile = file("README.md", readme, "text/markdown");
    const packManifest = {
      packId: crypto.randomUUID(),
      packVersion: "1.0.0",
      caseRevision: bundle.case.revision,
      customerDisplayName: customer,
      generatedAt: now,
      generatorVersion: DELIVERABLE_GENERATOR_VERSION,
      readinessState: readiness.state,
      claimAudit:
        claimAuditStatus(readiness, editAudit),
      sourceFreshness: bundle.case.sourceFreshness.state,
      exclusions: readiness.claimAudit.excluded.map((x) => x.reason),
      knownLimitations: [...readiness.blocked, ...readiness.needsAttention],
      includedArtifacts: [readmeFile, ...contentFiles].map((entry) => entry.path),
      files: [readmeFile, ...contentFiles].map((f) => ({
        path: f.path,
        byteSize: f.bytes.length,
        sha256: sha(f.bytes),
      })),
    };
    const files = [
      readmeFile,
      file(
        "manifest.json",
        JSON.stringify(packManifest, null, 2),
        "application/json",
      ),
      ...contentFiles,
    ];
    const internalReviewerFile = file(
      `review/${stem}-internal-reviewer-brief.md`,
      internalReviewer,
      "text/markdown",
    );
    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.bytes);
    const pack = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const packValidation = await validatePack(pack);
    const responseBinaryBytes =
      files.reduce((total, entry) => total + entry.bytes.length, 0) +
      internalReviewerFile.bytes.length +
      pack.length;
    if (
      files.length > MAX_PACK_FILES ||
      files.some((entry) => entry.bytes.length > MAX_ARTIFACT_BYTES) ||
      pack.length > MAX_PACK_BYTES ||
      responseBinaryBytes > MAX_RESPONSE_BINARY_BYTES
    )
      return NextResponse.json(
        { error: "Generated artifact output exceeds the safe size budget." },
        { status: 413 },
      );
    const customerBlocked =
      readiness.state === "blocked" &&
      profile.data !== "internal-solution-review";
    const safeText = [
      requestedMermaid,
      svg,
      brief.markdown,
      storyboardMd,
      notesMd,
      sourceJson,
      internalReviewer,
    ].join("\n");
    if (containsProhibitedExportText(safeText))
      return NextResponse.json(
        { error: "Generated content failed the secret and local-path scan." },
        { status: 422 },
      );
    const artifacts = [
      ...[...files, internalReviewerFile].map((f) => ({
        type: typeFor(f.path),
        fileName: f.path.split("/").at(-1) ?? "artifact",
        mimeType: f.mimeType,
        byteSize: f.bytes.length,
        sha256: sha(f.bytes),
        base64: binary(f.bytes),
        valid:
          f.path.endsWith(".pptx") && customerBlocked
            ? false
            : f.path.endsWith(".pdf")
              ? pdfValidation.valid
              : f.path.endsWith(".pptx")
                ? pptxValidation.valid
                : true,
      })),
      {
        type: "solution-pack",
        fileName: `${stem}-customer-solution-pack.zip`,
        mimeType: "application/zip",
        byteSize: pack.length,
        sha256: sha(pack),
        base64: binary(pack),
        valid: packValidation.valid && !customerBlocked,
      },
    ];
    const artifactRecords = buildArtifactRecords({
      artifacts,
      bundle,
      projectId,
      now,
      customer,
      readiness,
      editAudit,
      sources,
      profile: profile.data,
      sourceItemIdsByType,
      editedArtifactTypes,
    });
    const project = deliverableProjectSchema.parse({
      id: projectId,
      caseId: bundle.case.id,
      schemaVersion: "solution-deliverables-v1",
      title: edits.title || `${customer} Solution Deliverables`,
      customerDisplayName: customer,
      audience: profile.data,
      artifactProfile: profile.data,
      readinessState: readiness.state,
      sourceCaseRevision: bundle.case.revision,
      generatedAt: now,
      updatedAt: now,
      generatedBy: "deterministic",
      redactionState:
        readiness.state === "blocked"
          ? "blocked"
          : claimAuditStatus(readiness, editAudit) === "qualified"
            ? "review-required"
            : "redacted",
      sourceFreshness: bundle.case.sourceFreshness.state,
      claimAuditStatus: claimAuditStatus(readiness, editAudit),
      artifactIds: artifactRecords.map((artifact) => artifact.id),
      provenance: {
        sourceItemIds: projectSourceItemIds,
        sourceReferenceIds: sourceReferenceIdsFor(
          sources,
          projectSourceItemIds,
          editAudit.userEdited,
        ),
        generationMode:
          editAudit.userEdited || mermaidUserEdited
            ? "user-edited"
            : "deterministic",
        generatedAt: now,
      },
    });
    const sections = storyboard.slides.map((slide, index) =>
      deliverableSectionSchema.parse({
        id: `${projectId}-section-${index + 1}`,
        artifactId:
          artifactRecords.find(
            (artifact) => artifact.artifactType === "presentation-pptx",
          )?.id ?? "presentation",
        sectionType: "presentation-slide",
        heading: slide.title,
        content: slide.bullets.map((bullet) => bullet.text).join("\n"),
        structuredContent: { slideNumber: index + 1 },
        priority: index < 3 ? "high" : "normal",
        sourceItemIds: [
          ...new Set(
            slide.bullets.flatMap((bullet) => bullet.sourceItemIds),
          ),
        ],
        sourceReferenceIds: sourceReferenceIdsFor(
          sources,
          slide.bullets.flatMap((bullet) => bullet.sourceItemIds),
          Boolean(
            edits.slideTitles?.[index] ||
              edits.slideTakeaways?.[index] ||
              (index === storyboard.slides.length - 1 &&
                (edits.openQuestions?.length || edits.nextActions?.length)),
          ),
        ),
        claimSafety:
          editAudit.status === "qualified"
            ? "needs-qualification"
            : "safe-to-say",
        visibility:
          profile.data === "internal-solution-review"
            ? "internal"
            : "customer",
        included: true,
        userEdited: Boolean(
          edits.slideTitles?.[index] || edits.slideTakeaways?.[index],
        ),
        provenance: {
          sourceItemIds: [
            ...new Set(
              slide.bullets.flatMap((bullet) => bullet.sourceItemIds),
            ),
          ],
          sourceReferenceIds: sourceReferenceIdsFor(
            sources,
            slide.bullets.flatMap((bullet) => bullet.sourceItemIds),
            Boolean(
              edits.slideTitles?.[index] ||
                edits.slideTakeaways?.[index] ||
                (index === storyboard.slides.length - 1 &&
                  (edits.openQuestions?.length || edits.nextActions?.length)),
            ),
          ),
          generationMode:
            edits.slideTitles?.[index] || edits.slideTakeaways?.[index]
              ? "user-edited"
              : "deterministic",
          generatedAt: now,
        },
      }),
    );
    return NextResponse.json({
      schemaVersion: "solution-deliverables-v1",
      generatedAt: now,
      project,
      artifactRecords,
      sections,
      readiness,
      editAudit,
      brief: {
        ...brief,
        pageCount: pdfValidation.pageCount,
        layout: pdfResult.layout,
      },
      presentation: {
        slideCount: storyboard.slides.length,
        titles: storyboard.slides.map((s) => s.title),
      },
      mermaid: {
        ...mermaidValidation,
        userEdited: mermaidUserEdited,
        originalSource: generatedMermaid.source,
      },
      validations: {
        pdf: pdfValidation,
        presentation: pptxValidation,
        pack: packValidation,
      },
      packManifest,
      artifacts,
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Case payload is too large." }, { status: 413 });
    }
    return NextResponse.json(
      {
        error: "Deliverable generation failed safely.",
        category: error instanceof Error ? error.name : "unknown",
      },
      { status: 500 },
    );
  } finally {
    if (concurrency) await concurrency.release();
  }
}

function combineEditAudits(
  wording: ReturnType<typeof auditDeliverableManualEdits>,
  mermaid: ReturnType<typeof auditMermaidEdit>,
): ReturnType<typeof auditDeliverableManualEdits> & {
  mermaid: ReturnType<typeof auditMermaidEdit>;
} {
  const status =
    wording.status === "blocked"
      ? ("blocked" as const)
      : wording.status === "qualified" || mermaid.status === "qualified"
        ? ("qualified" as const)
        : ("passed" as const);
  return {
    ...wording,
    userEdited: wording.userEdited || mermaid.userEdited,
    status,
    unsupportedFields:
      mermaid.status === "qualified"
        ? [...wording.unsupportedFields, "mermaid"]
        : wording.unsupportedFields,
    message:
      mermaid.status === "qualified"
        ? `${wording.message} ${mermaid.message}`
        : wording.message,
    mermaid,
  };
}

function claimAuditStatus(
  readiness: ReturnType<typeof assessDeliverableReadiness>,
  editAudit: ReturnType<typeof auditDeliverableManualEdits>,
) {
  if (readiness.state === "blocked") return "blocked" as const;
  if (
    editAudit.status === "qualified" ||
    readiness.claimAudit.needsQualification.length ||
    readiness.claimAudit.warnings.length
  )
    return "qualified" as const;
  return "passed" as const;
}

function withManualEditReadiness(
  readiness: ReturnType<typeof assessDeliverableReadiness>,
  editAudit: ReturnType<typeof auditDeliverableManualEdits>,
) {
  if (editAudit.status === "passed") return readiness;
  if (editAudit.status === "blocked")
    return {
      ...readiness,
      state: "blocked" as const,
      blocked: [...readiness.blocked, editAudit.message],
    };
  return {
    ...readiness,
    state:
      readiness.state === "exploratory" || readiness.state === "blocked"
        ? readiness.state
        : ("draft" as const),
    needsAttention: [
      ...readiness.needsAttention,
      "User-edited wording requires evidence review before customer sharing.",
    ],
  };
}

function containsProhibitedExportText(value: string | Uint8Array) {
  const text =
    typeof value === "string" ? value : Buffer.from(value).toString("utf8");
  const scan = scanDeliverableText(text);
  return scan.hasSecret || scan.hasLocalPath;
}

function file(path: string, data: string | Uint8Array, mimeType: string) {
  if (path.startsWith("/") || path.includes("..") || path.includes("\\"))
    throw new Error("Unsafe pack path");
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return { path, bytes, mimeType };
}
function typeFor(path: string) {
  if (path.endsWith(".mmd")) return "mermaid";
  if (path.endsWith(".svg")) return "svg";
  if (path.endsWith(".pdf")) return "brief-pdf";
  if (path.endsWith(".pptx")) return "presentation-pptx";
  if (path.endsWith("source-manifest.json")) return "source-manifest";
  if (path.includes("internal-reviewer-brief.md"))
    return "internal-reviewer-brief";
  if (path.includes("presentation-storyboard.md"))
    return "presentation-storyboard";
  if (path.includes("speaker-notes.md")) return "speaker-notes";
  if (path.includes("technical-solution-brief.md")) return "brief-markdown";
  return path.endsWith(".md") ? "markdown" : "manifest";
}

type RuntimeArtifact = {
  type: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  base64: string;
  valid: boolean;
};

function buildArtifactRecords({
  artifacts,
  bundle,
  projectId,
  now,
  customer,
  readiness,
  editAudit,
  sources,
  profile,
  sourceItemIdsByType,
  editedArtifactTypes,
}: {
  artifacts: RuntimeArtifact[];
  bundle: SolutionCaseBundle;
  projectId: string;
  now: string;
  customer: string;
  readiness: ReturnType<typeof assessDeliverableReadiness>;
  editAudit: ReturnType<typeof auditDeliverableManualEdits>;
  sources: ReturnType<typeof buildSourceManifest>;
  profile: string;
  sourceItemIdsByType: Record<string, string[]>;
  editedArtifactTypes: Set<string>;
}) {
  const supported = new Set([
    "mermaid",
    "svg",
    "brief-markdown",
    "brief-pdf",
    "presentation-pptx",
    "presentation-storyboard",
    "speaker-notes",
    "source-manifest",
    "internal-reviewer-brief",
    "solution-pack",
  ]);
  return artifacts
    .filter((artifact) => supported.has(artifact.type))
    .map((artifact) => {
      const userEdited = editedArtifactTypes.has(artifact.type);
      const sourceItemIds = sourceItemIdsByType[artifact.type] ?? [];
      return deliverableArtifactSchema.parse({
        id: artifactRecordId(artifact.type, bundle.case.revision, projectId),
        projectId,
        artifactType: artifact.type,
        title: `${customer} ${artifact.type.replaceAll("-", " ")}`,
        status: artifact.valid
          ? readiness.state === "blocked"
            ? "draft"
            : "valid"
          : readiness.state === "blocked"
            ? "blocked"
            : "invalid",
        version: 1,
        audience: profile,
        outputFormat: artifact.fileName.split(".").at(-1) ?? "binary",
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        byteSize: artifact.byteSize,
        sha256: artifact.sha256,
        sourceCaseRevision: bundle.case.revision,
        sourceItemIds,
        sourceReferenceIds: sourceReferenceIdsFor(
          sources,
          sourceItemIds,
          userEdited,
        ),
        privateItemIdsExcluded: readiness.claimAudit.excluded
          .map((entry) => entry.item.id)
          .filter((id) => !sourceItemIds.includes(id)),
        warnings: [
          ...readiness.blocked,
          ...readiness.needsAttention,
          ...(editAudit.status === "qualified" ? [editAudit.message] : []),
        ],
        validationResults: [
          {
            name: "runtime-artifact-validation",
            passed: artifact.valid,
            detail: artifact.valid
              ? "Structure and export-safety checks passed."
              : "Artifact is unavailable for this readiness/profile state.",
          },
        ],
        createdAt: now,
        updatedAt: now,
        generatorVersion: DELIVERABLE_GENERATOR_VERSION,
        userEdited,
        userEditTimestamp: userEdited ? now : undefined,
        redactionStatus:
          readiness.state === "blocked" ||
          claimAuditStatus(readiness, editAudit) === "qualified"
            ? "review-required"
            : "redacted",
        claimAuditStatus: claimAuditStatus(readiness, editAudit),
        provenance: {
          sourceItemIds,
          sourceReferenceIds: sourceReferenceIdsFor(
            sources,
            sourceItemIds,
            userEdited,
          ),
          generationMode: userEdited ? "user-edited" : "deterministic",
          generatedAt: now,
        },
      });
    });
}

function artifactRecordId(type: string, revision: number, projectId: string) {
  return `${projectId}-artifact-${type}-${revision}`;
}

function sourceReferenceIdsFor(
  sources: ReturnType<typeof buildSourceManifest>,
  sourceItemIds: string[],
  includeUserEdit = false,
) {
  const itemIds = new Set(sourceItemIds);
  return sources
    .filter(
      (source) =>
        (source.sourceType === "user-edit" && includeUserEdit) ||
        source.claimIds.some((id) => itemIds.has(id)),
    )
    .map((source) => source.id);
}

function manualEditArtifactTypes(
  edits: DeliverableManualEdits,
  mermaidUserEdited: boolean,
) {
  const types = new Set<string>();
  const briefEdited = Boolean(
    edits.title || edits.executiveSummary || edits.sectionWording,
  );
  const presentationEdited = Boolean(
    edits.title ||
      edits.slideTitles?.length ||
      edits.slideTakeaways?.length ||
      edits.openQuestions?.length ||
      edits.nextActions?.length,
  );
  if (briefEdited) {
    types.add("brief-markdown");
    types.add("brief-pdf");
  }
  if (presentationEdited) {
    types.add("presentation-pptx");
    types.add("presentation-storyboard");
    types.add("speaker-notes");
  }
  if (mermaidUserEdited) {
    types.add("mermaid");
    types.add("svg");
  }
  if (briefEdited || presentationEdited || mermaidUserEdited) {
    types.add("source-manifest");
    types.add("solution-pack");
  }
  return types;
}
async function createOnePagePdf(
  documentTitle: string,
  markdown: string,
  size: "Letter" | "A4",
  mermaidSource: string,
  brandMark: Uint8Array,
) {
  const dims: [number, number] =
    size === "A4" ? [595.28, 841.89] : [612, 792];
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brandImage = await pdf.embedPng(brandMark);
  const normalizedTitle = pdfPlainText(documentTitle).slice(0, 180);
  pdf.setTitle(normalizedTitle);
  pdf.setSubject("One-Page Technical Solution Brief");
  pdf.setCreator("ONE Voice Lab · Omni Neural Engine");
  pdf.setProducer("Solution Deliverables Studio");
  const content = parsePdfBrief(markdown);
  const architectureNodes = [
    ...mermaidSource.matchAll(/^\s*(n\d+)\["([^"]+)"\]\s*$/gm),
  ]
    .map((match) => ({
      id: match[1],
      label: readableArchitectureLabel(match[2]),
    }))
    .slice(0, 4);
  const architectureNodeIds = new Set(architectureNodes.map((node) => node.id));
  const architectureEdges = [
    ...mermaidSource.matchAll(
      /^\s*(n\d+)\s+-->(?:\|([A-Za-z0-9 -]+)\|)?\s*(n\d+)\s*$/gm,
    ),
  ]
    .map((match) => ({ from: match[1], label: match[2] ?? "", to: match[3] }))
    .filter(
      (edge) =>
        architectureNodeIds.has(edge.from) && architectureNodeIds.has(edge.to),
    )
    .slice(0, 4);
  const diagramHeight = architectureNodes.length ? 100 : 0;
  const contentTop = dims[1] - 85 - diagramHeight;
  const availableHeight = contentTop - 36;
  const gutter = 18;
  const columnWidth = (dims[0] - 72 - gutter) / 2;
  const sizes = [10, 9.6, 9.2, 8.8, 8.4, 8];
  let layout:
    | {
        fontSize: number;
        lineHeight: number;
        headingSize: number;
        headingLineHeight: number;
        columns: ReturnType<typeof layoutPdfSection>[][];
        columnHeights: number[];
        requiredHeight: number;
        lineCount: number;
        maxMeasuredWidth: number;
      }
    | undefined;
  for (const fontSize of sizes) {
    const headingSize = fontSize + 1.7;
    const lineHeight = fontSize + 2.25;
    const headingLineHeight = headingSize + 2;
    const sections = content.sections.map((section) =>
      layoutPdfSection(
        section,
        regular,
        bold,
        fontSize,
        headingSize,
        lineHeight,
        headingLineHeight,
        columnWidth,
      ),
    );
    const columns = balancePdfColumns(sections, availableHeight);
    if (columns) {
      const columnHeights = columns.map((column) =>
        column.reduce((total, section) => total + section.height, 0),
      );
      layout = {
        fontSize,
        lineHeight,
        headingSize,
        headingLineHeight,
        columns,
        columnHeights,
        requiredHeight: Math.max(...columnHeights),
        lineCount: sections.reduce(
          (total, section) =>
            total +
            section.headingLines.length +
            section.items.reduce((sum, item) => sum + item.length, 0),
          0,
        ),
        maxMeasuredWidth: sections.reduce(
          (maximum, section) => Math.max(maximum, section.maxMeasuredWidth),
          0,
        ),
      };
      break;
    }
  }
  if (!layout)
    return {
      bytes: new Uint8Array(),
      layout: {
        fit: false,
        minimumFontSize: 8,
        requiredHeight: null,
        availableHeight,
        clipped: false,
        sectionCount: content.sections.length,
        expectedSectionHeadings: content.sections.map(
          (section) => section.heading,
        ),
        renderedSectionHeadings: [] as string[],
        hasLiteralMarkdownLinks: content.hasLiteralMarkdownLinks,
        deduplicatedItemCount: content.deduplicatedItemCount,
      },
    };
  const page = pdf.addPage(dims);
  page.drawRectangle({
    x: 0,
    y: dims[1] - 65,
    width: dims[0],
    height: 65,
    color: rgb(0.02, 0.13, 0.17),
  });
  const displayTitle = truncatePdfText(
    normalizedTitle,
    bold,
    16,
    dims[0] - 68,
  );
  page.drawText(displayTitle, {
    x: 34,
    y: dims[1] - 34,
    font: bold,
    size: 16,
    color: rgb(0.88, 1, 0.98),
  });
  page.drawImage(brandImage, {
    x: dims[0] - 61,
    y: dims[1] - 55,
    width: 30,
    height: 30,
    opacity: 0.92,
  });
  if (content.statusLine)
    page.drawText(
      truncatePdfText(content.statusLine, regular, 7.4, dims[0] - 68),
      {
        x: 34,
        y: dims[1] - 51,
        font: regular,
        size: 7.4,
        color: rgb(0.65, 0.84, 0.84),
      },
    );
  if (architectureNodes.length) {
    page.drawText("Solution architecture", {
      x: 36,
      y: dims[1] - 84,
      font: bold,
      size: 9.2,
      color: rgb(0.02, 0.35, 0.4),
    });
    const gap = 8;
    const boxWidth = (dims[0] - 72 - gap * 3) / 4;
    const boxHeight = 40;
    const positions = new Map<
      string,
      { x: number; y: number; index: number }
    >();
    architectureNodes.forEach((node, index) => {
      const x = 36 + index * (boxWidth + gap);
      const boxY = dims[1] - 151;
      positions.set(node.id, { x, y: boxY, index });
      page.drawRectangle({
        x,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        borderColor: rgb(0.13, 0.65, 0.62),
        borderWidth: 0.8,
        color: rgb(0.94, 0.98, 0.98),
      });
      const labelLines = fitPdfLines(
        node.label,
        regular,
        7.2,
        boxWidth - 8,
        3,
      );
      labelLines.forEach((line, lineIndex) =>
        page.drawText(line, {
          x: x + 4,
          y: boxY + boxHeight - 12 - lineIndex * 9,
          font: regular,
          size: 7.2,
          color: rgb(0.05, 0.18, 0.2),
        }),
      );
    });
    architectureEdges.forEach((edge, edgeIndex) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to || from.index === to.index) return;
      const fromX = from.x + boxWidth / 2;
      const toX = to.x + boxWidth / 2;
      const boxTop = from.y + boxHeight;
      const laneY = boxTop + 7 + (edgeIndex % 3) * 5;
      page.drawLine({
        start: { x: fromX, y: boxTop },
        end: { x: fromX, y: laneY },
        thickness: 0.8,
        color: rgb(0.13, 0.65, 0.62),
      });
      page.drawLine({
        start: { x: fromX, y: laneY },
        end: { x: toX, y: laneY },
        thickness: 0.8,
        color: rgb(0.13, 0.65, 0.62),
      });
      page.drawLine({
        start: { x: toX, y: laneY },
        end: { x: toX, y: boxTop },
        thickness: 0.8,
        color: rgb(0.13, 0.65, 0.62),
      });
      page.drawLine({
        start: { x: toX, y: boxTop },
        end: { x: toX - 2.8, y: boxTop + 5 },
        thickness: 0.9,
        color: rgb(0.13, 0.65, 0.62),
      });
      page.drawLine({
        start: { x: toX, y: boxTop },
        end: { x: toX + 2.8, y: boxTop + 5 },
        thickness: 0.9,
        color: rgb(0.13, 0.65, 0.62),
      });
      if (edge.label)
        page.drawText(
          truncatePdfText(pdfPlainText(edge.label), regular, 6.2, 64),
          {
            x: Math.min(fromX, toX) + 4,
            y: laneY + 1.5,
            font: regular,
            size: 6.2,
            color: rgb(0.09, 0.45, 0.44),
          },
        );
    });
  }
  layout.columns.forEach((column, columnIndex) => {
    const x = 36 + columnIndex * (columnWidth + gutter);
    let y = contentTop;
    column.forEach((section) => {
      section.headingLines.forEach((line) => {
        page.drawText(line, {
          x,
          y,
          font: bold,
          size: layout.headingSize,
          color: rgb(0.02, 0.35, 0.4),
        });
        y -= layout.headingLineHeight;
      });
      page.drawLine({
        start: { x, y: y + 2 },
        end: { x: x + columnWidth, y: y + 2 },
        thickness: 0.45,
        color: rgb(0.72, 0.84, 0.84),
      });
      y -= 2;
      section.items.forEach((lines) => {
        lines.forEach((line, lineIndex) => {
          if (lineIndex === 0)
            page.drawText("-", {
              x,
              y,
              font: bold,
              size: layout.fontSize,
              color: rgb(0.13, 0.65, 0.62),
            });
          page.drawText(line, {
            x: x + 9,
            y,
            font: regular,
            size: layout.fontSize,
            color: rgb(0.1, 0.15, 0.18),
          });
          y -= layout.lineHeight;
        });
        y -= 1.5;
      });
      y -= 5;
    });
  });
  page.drawText(
    "Community-built solution artifact. Not official Deepgram material.",
    { x: 36, y: 20, font: regular, size: 7, color: rgb(0.35, 0.4, 0.42) },
  );
  return {
    bytes: await pdf.save(),
    layout: {
      fit: true,
      minimumFontSize: 8,
      fontSize: layout.fontSize,
      requiredHeight: layout.requiredHeight,
      availableHeight,
      clipped: false,
      architectureNodeCount: architectureNodes.length,
      architectureEdgeCount: architectureEdges.length,
      architectureArrowCount: architectureEdges.length,
      sectionCount: content.sections.length,
      expectedSectionHeadings: content.sections.map(
        (section) => section.heading,
      ),
      renderedSectionHeadings: layout.columns.flatMap((column) =>
        column.map((section) => section.heading),
      ),
      hasLiteralMarkdownLinks: content.hasLiteralMarkdownLinks,
      deduplicatedItemCount: content.deduplicatedItemCount,
      lineCount: layout.lineCount,
      columnCount: 2,
      columnWidth,
      columnHeights: layout.columnHeights,
      maxMeasuredWidth: layout.maxMeasuredWidth,
      plainTextCharacters: content.plainText.length,
      titleRendered: Boolean(displayTitle),
      pageSize: size,
    },
  };
}

function pdfPlainText(value: string) {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/\*\*/g, "")
    .replace(/\\([\\`*_{}\[\]<>#\-+])/g, "$1")
    .replace(/[\u00b5\u03bc]/g, "micro")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00b7/g, " - ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readableArchitectureLabel(value: string) {
  const text = pdfPlainText(value);
  if (text.length < 70 || /[.!?]$/.test(text)) return text;
  const punctuation = Math.max(
    text.lastIndexOf("; "),
    text.lastIndexOf(". "),
  );
  if (punctuation >= 36)
    return `${text.slice(0, punctuation).replace(/;$/, "")}.`;
  return `${text.replace(/\s+\S*$/, "").trimEnd()}...`;
}

function parsePdfBrief(markdown: string) {
  const sections: { heading: string; items: string[] }[] = [];
  let current: { heading: string; items: string[] } | undefined;
  let statusLine = "";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^#\s+/.test(line)) continue;
    if (
      current &&
      /^(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/.test(line)
    )
      break;
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      const normalizedHeading = pdfPlainText(heading[1]);
      current = sections.find(
        (section) => section.heading === normalizedHeading,
      );
      if (!current) {
        current = { heading: normalizedHeading, items: [] };
        sections.push(current);
      }
      continue;
    }
    if (!current && /^\*\*/.test(line)) {
      statusLine = pdfPlainText(line);
      continue;
    }
    if (!current) continue;
    const item = pdfPlainText(line.replace(/^[-+]\s+/, ""));
    if (item) current.items.push(item);
  }
  const seen = new Set<string>();
  let deduplicatedItemCount = 0;
  const deduplicated = sections.flatMap((section) => {
    const items = section.items.filter((item) => {
      const key = item
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (!key || seen.has(key)) {
        deduplicatedItemCount += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
    return items.length ? [{ ...section, items }] : [];
  });
  const plainText = [
    statusLine,
    ...deduplicated.flatMap((section) => [section.heading, ...section.items]),
  ].join("\n");
  return {
    sections: deduplicated,
    statusLine,
    plainText,
    deduplicatedItemCount,
    hasLiteralMarkdownLinks: /\[[^\]]+\]\([^)]+\)/.test(plainText),
  };
}

function layoutPdfSection(
  section: { heading: string; items: string[] },
  regular: PDFFont,
  bold: PDFFont,
  fontSize: number,
  headingSize: number,
  lineHeight: number,
  headingLineHeight: number,
  columnWidth: number,
) {
  const headingLines = wrapByWidth(
    section.heading,
    bold,
    headingSize,
    columnWidth,
  );
  const items = section.items.map((item) =>
    wrapByWidth(item, regular, fontSize, columnWidth - 9),
  );
  const height =
    headingLines.length * headingLineHeight +
    2 +
    items.reduce(
      (total, lines) => total + lines.length * lineHeight + 1.5,
      0,
    ) +
    5;
  const maxMeasuredWidth = Math.max(
    ...headingLines.map((line) => bold.widthOfTextAtSize(line, headingSize)),
    ...items.flatMap((lines) =>
      lines.map(
        (line) => regular.widthOfTextAtSize(line, fontSize) + 9,
      ),
    ),
    0,
  );
  return { ...section, headingLines, items, height, maxMeasuredWidth };
}

function balancePdfColumns<T extends { height: number }>(
  sections: T[],
  availableHeight: number,
): [T[], T[]] | undefined {
  if (!sections.length) return undefined;
  if (sections.length === 1)
    return sections[0].height <= availableHeight ? [sections, []] : undefined;
  let best: { columns: [T[], T[]]; tallest: number } | undefined;
  for (let split = 1; split < sections.length; split += 1) {
    const columns: [T[], T[]] = [
      sections.slice(0, split),
      sections.slice(split),
    ];
    const heights = columns.map((column) =>
      column.reduce((total, section) => total + section.height, 0),
    );
    const tallest = Math.max(...heights);
    if (
      tallest <= availableHeight &&
      (!best || tallest < best.tallest)
    )
      best = { columns, tallest };
  }
  return best?.columns;
}

function truncatePdfText(
  value: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
) {
  if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) return value;
  let text = value;
  while (
    text.length &&
    font.widthOfTextAtSize(`${text}...`, fontSize) > maxWidth
  )
    text = text.slice(0, -1);
  return `${text.trimEnd()}...`;
}

function fitPdfLines(
  value: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
) {
  const lines = wrapByWidth(value, font, fontSize, maxWidth);
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, maxLines - 1),
    truncatePdfText(
      lines.slice(maxLines - 1).join(" "),
      font,
      fontSize,
      maxWidth,
    ),
  ];
}
function wrapByWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
) {
  const words = text.split(/\s+/).flatMap((word) => {
      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) return [word];
      const chunks: string[] = [];
      let chunk = "";
      for (const character of word) {
        const candidate = `${chunk}${character}`;
        if (chunk && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else chunk = candidate;
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    }),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (line && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      if (line) lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

async function validatePdf(
  bytes: Uint8Array,
  expected: {
    title: string;
    size: "Letter" | "A4";
    layout: Awaited<ReturnType<typeof createOnePagePdf>>["layout"];
  },
) {
  const errors: string[] = [];
  let pageCount = 0;
  let metadataTitle = false;
  let pageDimensions = false;
  let contentStream = false;
  if (bytes.length < 500) errors.push("PDF is empty or too small.");
  try {
    const parsed = await PDFDocument.load(bytes);
    pageCount = parsed.getPageCount();
    if (pageCount !== 1)
      errors.push(`Expected exactly one page; found ${pageCount}.`);
    metadataTitle = parsed.getTitle() === pdfPlainText(expected.title).slice(0, 180);
    if (!metadataTitle) errors.push("PDF title metadata does not match the brief title.");
    const page = parsed.getPages()[0];
    if (page) {
      const expectedDimensions =
        expected.size === "A4"
          ? { width: 595.28, height: 841.89 }
          : { width: 612, height: 792 };
      const actual = page.getSize();
      pageDimensions =
        Math.abs(actual.width - expectedDimensions.width) < 0.2 &&
        Math.abs(actual.height - expectedDimensions.height) < 0.2;
      if (!pageDimensions)
        errors.push(`PDF page dimensions do not match ${expected.size}.`);
      contentStream = Boolean(page.node.Contents());
      if (!contentStream) errors.push("PDF page has no content stream.");
    }
  } catch {
    errors.push("PDF could not be parsed.");
  }
  const layout = expected.layout;
  const expectedHeadings = layout.expectedSectionHeadings as string[];
  const renderedHeadings = layout.renderedSectionHeadings as string[];
  if (!layout.fit || layout.clipped)
    errors.push("PDF layout did not complete within the one-page content area.");
  if (layout.hasLiteralMarkdownLinks)
    errors.push("PDF plain text contains literal Markdown link syntax.");
  if (
    renderedHeadings.length !== expectedHeadings.length ||
    expectedHeadings.some(
      (heading) => !renderedHeadings.includes(heading),
    )
  )
    errors.push("PDF did not render every expected section heading.");
  if (typeof layout.fontSize === "number" && layout.fontSize < 8)
    errors.push("PDF body font is below the readable minimum.");
  if (
    typeof layout.maxMeasuredWidth === "number" &&
    typeof layout.columnWidth === "number" &&
    layout.maxMeasuredWidth > layout.columnWidth + 0.5
  )
    errors.push("PDF contains text wider than its content column.");
  if (
    Array.isArray(layout.columnHeights) &&
    layout.columnHeights.some((height) => height > layout.availableHeight + 0.5)
  )
    errors.push("PDF content exceeds the available column height.");
  if (
    typeof layout.architectureEdgeCount === "number" &&
    typeof layout.architectureArrowCount === "number" &&
    layout.architectureArrowCount !== layout.architectureEdgeCount
  )
    errors.push("PDF architecture relationships are missing arrowheads.");
  if (
    typeof layout.plainTextCharacters === "number" &&
    layout.plainTextCharacters < 40
  )
    errors.push("PDF does not contain enough expected brief text.");
  return {
    valid: !errors.length,
    errors,
    pageCount,
    checks: {
      metadataTitle,
      pageDimensions,
      contentStream,
      sectionHeadings: !errors.some((error) =>
        error.includes("section heading"),
      ),
      readableFont:
        typeof layout.fontSize !== "number" || layout.fontSize >= 8,
      noLiteralMarkdownLinks: !layout.hasLiteralMarkdownLinks,
      withinLayoutBounds: !errors.some((error) =>
        /content area|content exceeds|wider than/.test(error),
      ),
      architectureArrows:
        typeof layout.architectureEdgeCount !== "number" ||
        typeof layout.architectureArrowCount !== "number" ||
        layout.architectureArrowCount === layout.architectureEdgeCount,
    },
  };
}

const PRESENTATION_TITLE_FONT_SIZE = 36;
const PRESENTATION_BODY_FONT_SIZE = 18;
const PRESENTATION_MIN_BODY_FONT_SIZE = 16;

function estimatedPresentationLines(
  value: string,
  width: number,
  fontSize: number,
) {
  const charactersPerLine = Math.max(
    24,
    Math.floor((width * 72) / (fontSize * 0.56)),
  );
  const words = value.trim().split(/\s+/).filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const length = word.length + (used ? 1 : 0);
    if (used && used + length > charactersPerLine) {
      lines += 1;
      used = word.length;
    } else used += length;
  }
  return lines;
}

function presentationBulletLayout(
  bullets: { text: string }[],
  role: string,
) {
  const diagram = role === "architecture";
  const success = role === "success";
  const y = diagram ? 3.48 : success ? 3.78 : 1.55;
  const availableHeight = diagram ? 2.95 : success ? 2.55 : 5.15;
  const textWidth = 11.05;
  const gap = 0.14;
  const choose = (fontSize: number) => {
    const heights = bullets.map((bullet) =>
      Math.max(
        0.48,
        estimatedPresentationLines(bullet.text, textWidth, fontSize) *
          ((fontSize * 1.24) / 72) +
          0.13,
      ),
    );
    return {
      fontSize,
      heights,
      totalHeight:
        heights.reduce((sum, height) => sum + height, 0) +
        Math.max(0, heights.length - 1) * gap,
    };
  };
  const preferred = choose(PRESENTATION_BODY_FONT_SIZE);
  const layout =
    preferred.totalHeight <= availableHeight
      ? preferred
      : choose(PRESENTATION_MIN_BODY_FONT_SIZE);
  return {
    ...layout,
    y,
    textWidth,
    gap,
    availableHeight,
    fits: layout.totalHeight <= availableHeight,
  };
}

function namedShapeBlocks(xml: string, prefix: string) {
  const blocks = [
    ...(xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []),
    ...(xml.match(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g) ?? []),
  ];
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return blocks.filter((block) =>
    new RegExp(`\\bname="${escaped}`).test(block),
  );
}

function minimumShapeFontSize(shapeXml: string) {
  const sizes = [...shapeXml.matchAll(/\bsz="(\d+)"/g)].map((match) =>
    Number(match[1]),
  );
  return sizes.length ? Math.min(...sizes) / 100 : 0;
}

async function validatePptx(
  bytes: Uint8Array,
  expectedSlideCount: number,
  expectedTitles: string[],
  storyboard: ReturnType<typeof buildPresentationStoryboard>,
) {
  const errors: string[] = [];
  storyboard.slides.forEach((slide, index) => {
    const maximumBullets = slide.presentationRole === "architecture" ? 2 : 4;
    const maximumBulletLength = 320;
    const layout = presentationBulletLayout(
      slide.bullets,
      slide.presentationRole,
    );
    if (slide.title.length > 90)
      errors.push(`Slide ${index + 1} title exceeds the one-line layout budget.`);
    if (slide.bullets.length > maximumBullets)
      errors.push(`Slide ${index + 1} exceeds the bounded bullet count.`);
    if (slide.bullets.some((bullet) => bullet.text.length > maximumBulletLength))
      errors.push(`Slide ${index + 1} has an oversized bullet.`);
    if (slide.bullets.some((bullet) => /…|\.\.\./.test(bullet.text)))
      errors.push(`Slide ${index + 1} contains truncation punctuation.`);
    if (!layout.fits)
      errors.push(`Slide ${index + 1} exceeds its explicit body-text box.`);
  });
  if (
    storyboard.architectureFlow.length < 2 ||
    storyboard.architectureFlow.length > 5
  )
    errors.push("The presentation requires a bounded native architecture flow.");
  if (storyboard.architectureFlow.some((node) => node.label.length > 52))
    errors.push("An architecture node label exceeds the native shape budget.");
  if (bytes.length < 1_000) errors.push("PowerPoint is empty or too small.");
  let titleTypography = true;
  let bodyTypography = true;
  let nativeArchitecture = true;
  let architectureStatusLabeling = true;
  try {
    const zip = await JSZip.loadAsync(bytes);
    const paths = Object.keys(zip.files);
    for (const required of [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
    ])
      if (!zip.file(required)) errors.push(`Missing ${required}.`);
    const slidePaths = paths
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort(
        (left, right) =>
          Number(left.match(/slide(\d+)/)?.[1]) -
          Number(right.match(/slide(\d+)/)?.[1]),
      );
    if (slidePaths.length !== expectedSlideCount)
      errors.push(
        `Expected ${expectedSlideCount} slides; found ${slidePaths.length}.`,
      );
    const slideXml = await Promise.all(
      slidePaths.map(async (path) => ({
        path,
        text: await zip.file(path)!.async("string"),
      })),
    );
    for (const [index, entry] of slideXml.entries()) {
      const titleShapes = namedShapeBlocks(entry.text, "Slide title");
      if (
        titleShapes.length !== 1 ||
        minimumShapeFontSize(titleShapes[0]) < PRESENTATION_TITLE_FONT_SIZE
      ) {
        titleTypography = false;
        errors.push(`Slide ${index + 1} is missing the 36pt editable title.`);
      }
      const bodyShapes = namedShapeBlocks(entry.text, "Body bullet text");
      if (
        bodyShapes.length !== storyboard.slides[index]?.bullets.length ||
        bodyShapes.some(
          (shape) =>
            minimumShapeFontSize(shape) < PRESENTATION_MIN_BODY_FONT_SIZE,
        )
      ) {
        bodyTypography = false;
        errors.push(`Slide ${index + 1} body typography is incomplete or too small.`);
      }
    }
    const architectureIndex = storyboard.slides.findIndex(
      (slide) => slide.presentationRole === "architecture",
    );
    const architectureXml = slideXml[architectureIndex]?.text ?? "";
    const architectureNodes = namedShapeBlocks(
      architectureXml,
      "Architecture node container",
    );
    const architectureConnectors = namedShapeBlocks(
      architectureXml,
      "Architecture connector",
    );
    nativeArchitecture =
      architectureNodes.length === storyboard.architectureFlow.length &&
      architectureConnectors.length ===
        Math.max(0, storyboard.architectureFlow.length - 1);
    if (!nativeArchitecture)
      errors.push(
        `The editable native architecture flow is incomplete (${architectureNodes.length}/${storyboard.architectureFlow.length} nodes, ${architectureConnectors.length}/${Math.max(0, storyboard.architectureFlow.length - 1)} connectors).`,
      );
    const expectedArchitectureHeading =
      storyboard.architectureStatus === "accepted"
        ? "Accepted architecture flow"
        : "Proposed architecture flow";
    architectureStatusLabeling = architectureXml.includes(
      xmlEscape(expectedArchitectureHeading),
    );
    if (!architectureStatusLabeling)
      errors.push("The architecture status heading does not match the case decision state.");
    const xmlFiles = await Promise.all(
      paths
        .filter((path) => path.endsWith(".xml") || path.endsWith(".rels"))
        .map(async (path) => ({
          path,
          text: await zip.file(path)!.async("string"),
        })),
    );
    const allXml = xmlFiles.map((entry) => entry.text).join("\n");
    if (/TargetMode\s*=\s*"External"/i.test(allXml))
      errors.push("An external Office relationship was found.");
    if (containsProhibitedExportText(allXml))
      errors.push("PowerPoint contains prohibited secret or local-path text.");
    for (const title of expectedTitles)
      if (!allXml.includes(xmlEscape(title.slice(0, 120))))
        errors.push(`Expected slide title is missing: ${title.slice(0, 80)}.`);
    for (const entry of xmlFiles.filter((file) =>
      file.path.endsWith(".rels"),
    )) {
      const targets = [
        ...entry.text.matchAll(
          /<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*>/gi,
        ),
      ];
      for (const target of targets) {
        if (/TargetMode\s*=\s*"External"/i.test(target[0])) continue;
        const resolved = resolveRelationshipTarget(entry.path, target[1]);
        if (resolved && !zip.file(resolved))
          errors.push(`Broken internal relationship: ${entry.path}.`);
      }
    }
  } catch {
    errors.push("PowerPoint is not a valid Office Open XML archive.");
  }
  return {
    valid: !errors.length,
    errors,
    slideCount: expectedSlideCount,
    checks: {
      titleTypography,
      bodyTypography,
      boundedContent: !errors.some((error) =>
        /bounded bullet|oversized bullet|body-text box|one-line layout/.test(error),
      ),
      noTruncation: !errors.some((error) =>
        error.includes("truncation punctuation"),
      ),
      nativeArchitecture,
      architectureStatusLabeling,
    },
  };
}

function resolveRelationshipTarget(relsPath: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const sourcePath =
    relsPath === "_rels/.rels"
      ? ""
      : relsPath.replace("/_rels/", "/").replace(/\.rels$/, "");
  return posix.normalize(posix.join(posix.dirname(sourcePath), target));
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function validatePack(bytes: Uint8Array) {
  const errors: string[] = [];
  try {
    const zip = await JSZip.loadAsync(bytes);
    const paths = Object.entries(zip.files)
      .filter(([, entry]) => !entry.dir)
      .map(([path]) => path);
    if (paths.length > MAX_PACK_FILES)
      errors.push(`Pack contains more than ${MAX_PACK_FILES} files.`);
    for (const path of paths)
      if (
        path.startsWith("/") ||
        path.startsWith(".") ||
        path.includes("..") ||
        path.includes("\\")
      )
        errors.push(`Unsafe ZIP path: ${path}.`);
    const requiredArtifacts = [
      ["README.md", (path: string) => path === "README.md"],
      ["manifest.json", (path: string) => path === "manifest.json"],
      ["Mermaid source", (path: string) => /^architecture\/.+\.mmd$/.test(path)],
      ["sanitized SVG", (path: string) => /^architecture\/.+\.svg$/.test(path)],
      [
        "architecture description",
        (path: string) => path === "architecture/architecture-description.md",
      ],
      ["brief Markdown", (path: string) => /^brief\/.+\.md$/.test(path)],
      ["one-page PDF", (path: string) => /^brief\/.+\.pdf$/.test(path)],
      [
        "editable PowerPoint",
        (path: string) => /^presentation\/.+\.pptx$/.test(path),
      ],
      [
        "presentation storyboard",
        (path: string) => path === "presentation/presentation-storyboard.md",
      ],
      [
        "speaker notes",
        (path: string) => path === "presentation/speaker-notes.md",
      ],
      ["source list", (path: string) => path === "evidence/sources.md"],
      [
        "source manifest",
        (path: string) => path === "evidence/source-manifest.json",
      ],
    ] as const;
    for (const [label, matches] of requiredArtifacts)
      if (!paths.some((path) => matches(path)))
        errors.push(`Required pack artifact is missing: ${label}.`);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) errors.push("Pack manifest is missing.");
    else {
      const manifest = JSON.parse(await manifestFile.async("string")) as {
        files?: { path: string; byteSize: number; sha256: string }[];
      };
      const declared = new Set(manifest.files?.map((entry) => entry.path));
      for (const entry of manifest.files ?? []) {
        const packed = zip.file(entry.path);
        if (!packed) {
          errors.push(`Manifest entry is missing: ${entry.path}.`);
          continue;
        }
        const content = await packed.async("uint8array");
        if (content.length !== entry.byteSize || sha(content) !== entry.sha256)
          errors.push(`Manifest checksum mismatch: ${entry.path}.`);
      }
      for (const path of paths)
        if (path !== "manifest.json" && !declared.has(path))
          errors.push(`Pack file is absent from the manifest: ${path}.`);
    }
    for (const path of paths.filter((value) =>
      /\.(?:md|mmd|svg|json|txt)$/i.test(value),
    )) {
      const content = await zip.file(path)!.async("string");
      if (containsProhibitedExportText(content))
        errors.push(`Prohibited text was found in ${path}.`);
    }
  } catch {
    errors.push("Solution Pack is not a valid ZIP archive.");
  }
  return { valid: !errors.length, errors };
}

async function createPptx(
  storyboard: ReturnType<typeof buildPresentationStoryboard>,
  readinessState: string,
  brandDataUrl: string,
) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "ONE Voice Lab · Omni Neural Engine";
  pptx.subject = "Evidence-grounded customer solution";
  pptx.title = storyboard.title;
  pptx.company = "Community-built Applied Voice Lab";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  for (const [index, item] of storyboard.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: "061019" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.18,
      fill: { color: "22D3C5" },
      line: { color: "22D3C5" },
      objectName: "Top accent rule",
    });
    slide.addText(item.title, {
      x: 0.65,
      y: 0.48,
      w: readinessState === "blocked" ? 8.25 : 12,
      h: 0.62,
      fontFace: "Aptos Display",
      fontSize: PRESENTATION_TITLE_FONT_SIZE,
      bold: true,
      color: "F3FFFF",
      margin: 0,
      fit: "none",
      breakLine: false,
      objectName: "Slide title",
    });
    if (readinessState === "blocked")
      slide.addText("DRAFT — INTERNAL REVIEW ONLY", {
        x: 9.05,
        y: 0.64,
        w: 3.6,
        h: 0.24,
        fontFace: "Aptos",
        fontSize: 10,
        bold: true,
        color: "FBBF24",
        align: "right",
        margin: 0,
        objectName: "Draft status",
      });

    if (item.presentationRole === "architecture") {
      slide.addText(
        storyboard.architectureStatus === "accepted"
          ? "Accepted architecture flow"
          : "Proposed architecture flow",
        {
        x: 0.72,
        y: 1.25,
        w: 5.2,
        h: 0.34,
        fontFace: "Aptos",
        fontSize: 24,
        bold: true,
        color: "8FB8BE",
        margin: 0,
        objectName: "Architecture heading",
        },
      );
      const nodes = storyboard.architectureFlow;
      const left = 0.72;
      const totalWidth = 11.9;
      const gap = 0.28;
      const nodeWidth =
        (totalWidth - Math.max(0, nodes.length - 1) * gap) /
        Math.max(1, nodes.length);
      const nodeY = 1.75;
      const nodeHeight = 1.12;
      for (let nodeIndex = 0; nodeIndex < nodes.length - 1; nodeIndex += 1) {
        const connectorX = left + (nodeIndex + 1) * nodeWidth + nodeIndex * gap;
        slide.addShape(pptx.ShapeType.line, {
          x: connectorX,
          y: nodeY + nodeHeight / 2,
          w: gap,
          h: 0,
          line: {
            color: "22D3C5",
            width: 2,
            endArrowType: "triangle",
          },
          objectName: `Architecture connector ${nodeIndex + 1}`,
        });
      }
      for (const [nodeIndex, node] of nodes.entries()) {
        const nodeX = left + nodeIndex * (nodeWidth + gap);
        slide.addShape(pptx.ShapeType.roundRect, {
          x: nodeX,
          y: nodeY,
          w: nodeWidth,
          h: nodeHeight,
          rectRadius: 0.06,
          fill: { color: "0D2530" },
          line: { color: "22D3C5", width: 1.5 },
          objectName: `Architecture node container ${nodeIndex + 1}`,
        });
        slide.addText(node.label, {
          x: nodeX + 0.12,
          y: nodeY + 0.13,
          w: nodeWidth - 0.24,
          h: nodeHeight - 0.26,
          fontFace: "Aptos",
          fontSize: PRESENTATION_MIN_BODY_FONT_SIZE,
          bold: true,
          color: "F3FFFF",
          margin: 0,
          align: "center",
          valign: "middle",
          fit: "none",
          objectName: `Architecture node label ${nodeIndex + 1}`,
        });
      }
    }

    if (
      item.presentationRole === "success" &&
      storyboard.successMeasures.length > 1
    ) {
      slide.addText("POC exit gate", {
        x: 0.72,
        y: 1.38,
        w: 3,
        h: 0.34,
        fontFace: "Aptos",
        fontSize: 24,
        bold: true,
        color: "8FB8BE",
        margin: 0,
        objectName: "Success heading",
      });
      const measures = storyboard.successMeasures;
      const trackLeft = 1.12;
      const trackWidth = 11.1;
      const trackY = 2.18;
      slide.addShape(pptx.ShapeType.line, {
        x: trackLeft,
        y: trackY,
        w: trackWidth,
        h: 0,
        line: { color: "245462", width: 2 },
        objectName: "Success measure track",
      });
      for (const [measureIndex, measure] of measures.entries()) {
        const centerX =
          trackLeft +
          (measureIndex * trackWidth) / Math.max(1, measures.length - 1);
        slide.addShape(pptx.ShapeType.ellipse, {
          x: centerX - 0.13,
          y: trackY - 0.13,
          w: 0.26,
          h: 0.26,
          fill: { color: "22D3C5" },
          line: { color: "22D3C5" },
          objectName: `Success measure marker ${measureIndex + 1}`,
        });
        slide.addText(measure, {
          x: centerX - 0.72,
          y: trackY + 0.32,
          w: 1.44,
          h: 0.46,
          fontFace: "Aptos",
          fontSize: PRESENTATION_MIN_BODY_FONT_SIZE,
          bold: true,
          color: "C8D9DE",
          margin: 0,
          align: "center",
          fit: "none",
          objectName: `Success measure label ${measureIndex + 1}`,
        });
      }
    }

    const bulletLayout = presentationBulletLayout(
      item.bullets,
      item.presentationRole,
    );
    if (item.bullets.length) {
      let bulletY = bulletLayout.y;
      item.bullets.forEach((bullet, bulletIndex) => {
        const bulletHeight = bulletLayout.heights[bulletIndex];
        slide.addText("•", {
          x: 0.78,
          y: bulletY + 0.02,
          w: 0.26,
          h: 0.32,
          fontFace: "Aptos",
          fontSize: 22,
          bold: true,
          color: "22D3C5",
          margin: 0,
          align: "center",
          objectName: `Body bullet marker ${bulletIndex + 1}`,
        });
        slide.addText(bullet.text, {
          x: 1.12,
          y: bulletY,
          w: bulletLayout.textWidth,
          h: bulletHeight,
          fontFace: "Aptos",
          fontSize: bulletLayout.fontSize,
          color: "C8D9DE",
          margin: 0,
          valign: "top",
          fit: "none",
          breakLine: false,
          objectName: `Body bullet text ${bulletIndex + 1}`,
        });
        bulletY += bulletHeight + bulletLayout.gap;
      });
    } else
      slide.addText("Open question — evidence required before finalization", {
        x: 1.12,
        y: bulletLayout.y,
        w: bulletLayout.textWidth,
        h: 0.52,
        fontFace: "Aptos",
        fontSize: PRESENTATION_MIN_BODY_FONT_SIZE,
        color: "C8D9DE",
        margin: 0,
        objectName: "Presentation empty state",
      });
    slide.addText(
      `${index + 1} / ${storyboard.slides.length}  ·  ${storyboard.disclaimer}`,
      {
        x: 0.65,
        y: 7.08,
        w: 12,
        h: 0.16,
        fontSize: 8,
        color: "69828A",
        margin: 0,
        align: "right",
        objectName: "Slide footer",
      },
    );
    slide.addImage({
      data: brandDataUrl,
      x: 0.65,
      y: 6.91,
      w: 0.24,
      h: 0.24,
      transparency: 12,
      objectName: "ONE Voice Lab brand mark",
    });
  }
  const data = await pptx.write({ outputType: "arraybuffer" });
  return new Uint8Array(data as ArrayBuffer);
}
