import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { POST } from "../../src/app/api/deliverables/generate/route";
import { resetGuestLabAccessForTests } from "../../src/lib/access/lab-access";
import {
  assessDeliverableReadiness,
  auditMermaidEdit,
  auditDeliverableManualEdits,
  buildBriefMarkdown,
  buildPresentationStoryboard,
  buildRedactedDeliverableCase,
  buildSolutionNarrative,
  buildSourceManifest,
  generateMermaid,
  mermaidToSafeSvg,
  safeMarkdownProse,
  safeStem,
  scanDeliverableText,
  validateMermaid,
} from "../../src/lib/solution-deliverables";
import { captureCaseItem } from "../../src/lib/live-solution-case";
import {
  SYNTHETIC_DELIVERABLE_SCENARIOS,
  lighthouseDeliverableCase,
  northstarDeliverableCase,
} from "../../src/lib/solution-deliverable-scenarios";
import {
  deliverableArtifactSchema,
  deliverableManualEditsSchema,
  deliverableProjectSchema,
  deliverableSectionSchema,
  deliverableSourceReferenceSchema,
  DELIVERABLES_SCHEMA_VERSION,
  solutionNarrativeSchema,
} from "../../src/types/solution-deliverables";
const NOW = "2026-07-28T12:00:00.000Z";

test.beforeEach(() => {
  resetGuestLabAccessForTests();
});

test.describe("Solution Deliverables Studio deterministic compiler", () => {
  test("validates versioned deliverable schemas and rejects a newer version", () => {
    const project = {
      id: "p",
      caseId: "c",
      schemaVersion: DELIVERABLES_SCHEMA_VERSION,
      title: "T",
      customerDisplayName: "Synthetic",
      audience: "product",
      artifactProfile: "customer-solution-pack",
      readinessState: "draft",
      sourceCaseRevision: 1,
      generatedAt: NOW,
      updatedAt: NOW,
      generatedBy: "deterministic",
      redactionState: "redacted",
      sourceFreshness: "unknown",
      claimAuditStatus: "qualified",
      artifactIds: [],
      provenance: {
        sourceItemIds: [],
        sourceReferenceIds: [],
        generationMode: "deterministic",
        generatedAt: NOW,
      },
    };
    expect(deliverableProjectSchema.safeParse(project).success).toBe(true);
    expect(
      deliverableProjectSchema.safeParse({
        ...project,
        schemaVersion: "solution-deliverables-v99",
      }).success,
    ).toBe(false);
    expect(deliverableArtifactSchema).toBeTruthy();
    expect(deliverableSectionSchema).toBeTruthy();
    expect(deliverableSourceReferenceSchema).toBeTruthy();
  });
  test("normalizes only active sourced items and preserves assumptions", () => {
    const b = northstarDeliverableCase();
    const n = buildSolutionNarrative(b);
    expect(n.customerOutcome[0].sourceItemIds).toHaveLength(1);
    expect(n.architectureDecisions[0].status).toBe("accepted");
    expect(n.currentProblem.length).toBeGreaterThan(0);
    expect(n.exclusions.some((x) => /api key/i.test(x.text))).toBe(true);
  });
  test("requires a strict sourced narrative and honors internal export approval", () => {
    const bundle = northstarDeliverableCase();
    const narrative = buildSolutionNarrative(bundle);
    expect(solutionNarrativeSchema.safeParse(narrative).success).toBe(true);
    expect(
      solutionNarrativeSchema.safeParse({
        ...narrative,
        currentProblem: [{ text: "Unsourced" }],
      }).success,
    ).toBe(false);
    expect(
      solutionNarrativeSchema.safeParse({ ...narrative, invented: [] }).success,
    ).toBe(false);
    const outcome = bundle.items.find((item) => item.kind === "business-outcome")!;
    outcome.includeInInternalExport = false;
    expect(
      buildSolutionNarrative(bundle, "internal-solution-review").customerOutcome,
    ).toHaveLength(0);
  });
  test("assigns the expected readiness across five synthetic cases", () => {
    for (const scenario of SYNTHETIC_DELIVERABLE_SCENARIOS) {
      const result = assessDeliverableReadiness(scenario.create());
      expect(result.state, `${scenario.id}: ${JSON.stringify(result)}`).toBe(
        scenario.expected,
      );
    }
    expect(
      assessDeliverableReadiness(lighthouseDeliverableCase()).blocked.join(" "),
    ).toMatch(/retentionPolicy|contradiction/i);
  });
  test("does not treat an unrelated official source as support for a Deepgram claim", () => {
    const bundle = northstarDeliverableCase();
    const requirement = bundle.items.find((item) => item.kind === "requirement")!;
    requirement.body =
      "Deepgram Voice Agent is the accepted production path for every environment.";
    bundle.relations = bundle.relations.filter(
      (relation) =>
        relation.fromItemId !== requirement.id ||
        relation.type !== "documented-by",
    );
    const readiness = assessDeliverableReadiness(bundle);
    expect(readiness.state).toBe("draft");
    expect(readiness.needsAttention.join(" ")).toMatch(/linked official evidence/i);
  });
  test("generates strict bounded Mermaid, accessible SVG, and rejects hostile edits", () => {
    const d = generateMermaid(northstarDeliverableCase());
    expect(d.validation).toMatchObject({ valid: true, securityMode: "strict" });
    expect(d.validation.nodeCount).toBe(5);
    expect(d.validation.edgeCount).toBe(4);
    expect(d.source).toMatch(/^flowchart LR/);
    expect(d.source).not.toMatch(/click|%%\{init|https?:/i);
    expect(mermaidToSafeSvg(d.source)).toContain('role="img"');
    expect(mermaidToSafeSvg(d.source)).toContain("<title");
    for (const hostile of [
      "flowchart LR\nclick n1 javascript:alert(1)",
      "%%{init:{}}%%\nflowchart LR",
      "flowchart LR\nn1[<script>x</script>]",
      "flowchart LR\nthis is not valid Mermaid",
      'flowchart LR\nn1["Known"]\nn1 --> n2',
    ])
      expect(validateMermaid(hostile).valid).toBe(false);
  });
  test("renders only evidenced Mermaid edges and qualifies relationship edits", () => {
    const generated = generateMermaid(northstarDeliverableCase()).source;
    const noEdges = 'flowchart LR\n  n1["Client"]\n  n2["Server"]';
    expect(validateMermaid(noEdges).valid).toBe(true);
    expect(mermaidToSafeSvg(noEdges)).not.toContain('marker-end="url(#a)"');
    const added = `${generated}\n  n99["Unsupported service"]`;
    expect(validateMermaid(added).valid).toBe(true);
    expect(auditMermaidEdit(generated, added)).toMatchObject({
      status: "qualified",
      unsupportedLabels: ["Unsupported service"],
    });
    const lines = generated.split("\n");
    const removed = lines.filter((line) => !line.includes("-->")).join("\n");
    expect(auditMermaidEdit(generated, removed).status).toBe("qualified");
  });
  test("audits bounded manual edits and preserves qualification", () => {
    const bundle = northstarDeliverableCase();
    expect(deliverableManualEditsSchema.safeParse({ title: "Safe title" }).success).toBe(true);
    const audit = auditDeliverableManualEdits(bundle, {
      executiveSummary: "A newly written customer claim without a source match.",
    });
    expect(audit).toMatchObject({ userEdited: true, status: "qualified" });
    expect(audit.unsupportedFields).toContain("executiveSummary");
    expect(
      auditDeliverableManualEdits(bundle, {
        title: "C:\\Users\\private-user\\notes.md",
      }).status,
    ).toBe("blocked");
    expect(
      auditDeliverableManualEdits(bundle, {
        openQuestions: ["Authorization: Token dg_abcdefghijklmnop"],
      }).status,
    ).toBe("blocked");
    const edited = buildBriefMarkdown(
      bundle,
      "customer-solution-pack",
      "Northstar",
      { executiveSummary: "A newly written customer claim without a source match." },
    );
    expect(edited.markdown).toContain("User-edited draft");
    const allFields = auditDeliverableManualEdits(bundle, {
      title: "Invented customer outcome for tomorrow's deployment",
      slideTitles: ["Invented deployment guarantee"],
      openQuestions: ["Invented requirement presented as agreed"],
    });
    expect(allFields.status).toBe("qualified");
    expect(allFields.unsupportedFields).toEqual(
      expect.arrayContaining(["title", "slideTitles", "openQuestions"]),
    );
    for (const unsafe of [
      "api_key=fixture-value",
      "eyJabcdefgh.abcdefgh.abcdefgh",
      "cookie=abcdefghijklmnop",
      "C:\\fixture\\customer-notes.txt",
    ])
      expect(
        scanDeliverableText(unsafe).hasSecret ||
          scanDeliverableText(unsafe).hasLocalPath,
      ).toBe(true);
    expect(safeMarkdownProse("![tracker](javascript:alert(1))")).not.toContain(
      "![tracker]",
    );
  });
  test("filters customer sources and creates an allowlisted redacted case", () => {
    let bundle = northstarDeliverableCase();
    bundle = captureCaseItem(
      bundle,
      {
        kind: "official-deepgram-evidence",
        title: "Hostile official claim",
        body: "This must not be labeled official.",
        structuredData: {
          canonicalSourceUrl: "https://developers.deepgram.com.evil.example/docs",
          sourceTitle: "Hostile",
          sourceType: "docs",
          conciseParaphrase: "Hostile",
          retrievedAt: NOW,
          lastVerifiedAt: NOW,
          freshnessState: "current",
          authorityLevel: "official-deepgram",
          citationIdentifier: "hostile",
        },
        verificationState: "officially-sourced",
      },
      NOW,
    );
    const hostile = bundle.items.at(-1)!;
    hostile.includeInCustomerExport = true;
    (bundle.items[0] as unknown as Record<string, unknown>).rawTranscript =
      "Private transcript material";
    bundle.items[0].structuredData = {
      ...bundle.items[0].structuredData,
      nested: { accessToken: "dg_abcdefghijklmnop" },
    };
    expect(buildSourceManifest(bundle).some((source) => source.title === "Hostile official claim")).toBe(false);
    const redacted = JSON.stringify(
      buildRedactedDeliverableCase(bundle, "customer-solution-pack"),
    );
    expect(redacted).not.toMatch(/Private transcript material|abcdefghijklmnop|rawTranscript|accessToken/);
  });
  test("pins scenario-specific official Deepgram evidence", () => {
    const expected = new Map([
      ["northstar", "/guides/fundamentals/token-based-authentication"],
      ["harbor", "/docs/live-streaming-audio"],
      ["atlas", "/sdks/sdk-features"],
      ["crescent", "/docs/models-languages-overview"],
      ["lighthouse", "/docs/self-hosted-introduction"],
    ]);
    for (const scenario of SYNTHETIC_DELIVERABLE_SCENARIOS) {
      const urls = buildSourceManifest(scenario.create())
        .filter((source) => source.authority === "official-deepgram")
        .map((source) => source.canonicalUrl);
      expect(urls.some((url) => url?.endsWith(expected.get(scenario.id)!))).toBe(
        true,
      );
      expect(
        urls.every((url) => url?.startsWith("https://developers.deepgram.com/")),
      ).toBe(true);
    }
  });
  test("builds one-page-budget briefs and profile-shaped presentations", () => {
    const b = northstarDeliverableCase();
    const brief = buildBriefMarkdown(
      b,
      "customer-solution-pack",
      "Northstar Appointments",
    );
    expect(brief.fit).toBe(true);
    expect(brief.markdown).not.toMatch(/long-lived browser api key/i);
    expect(brief.markdown.match(/The accepted decision is:/g) ?? []).toHaveLength(
      1,
    );
    const lighthouseBrief = buildBriefMarkdown(
      lighthouseDeliverableCase(),
      "customer-solution-pack",
      "Lighthouse Financial",
    );
    expect(lighthouseBrief.markdown).not.toMatch(
      /[.!?]+; this should be confirmed/gi,
    );
    const lighthouseFitSection = lighthouseBrief.markdown
      .split("## Why this design fits")[1]
      ?.split("## POC success measures")[0];
    expect(lighthouseFitSection).not.toMatch(
      /supplied artifact shows|customer stated/i,
    );
    const northstarStoryboard = buildPresentationStoryboard(
      b,
      "customer-solution-pack",
      "Northstar",
      "product",
    );
    expect(northstarStoryboard.slides).toHaveLength(6);
    expect(northstarStoryboard.architectureStatus).toBe("accepted");
    expect(northstarStoryboard.architectureFlow).toHaveLength(5);
    expect(
      northstarStoryboard.slides.flatMap((slide) => slide.bullets),
    ).not.toContainEqual(expect.objectContaining({ text: expect.stringMatching(/…|\.\.\./) }));
    expect(
      northstarStoryboard.slides.every((slide) => slide.bullets.length <= 4),
    ).toBe(true);
    expect(
      buildPresentationStoryboard(
        lighthouseDeliverableCase(),
        "customer-solution-pack",
        "Lighthouse",
      ).architectureStatus,
    ).toBe("proposed");
    const harbor = SYNTHETIC_DELIVERABLE_SCENARIOS.find(
      (scenario) => scenario.id === "harbor",
    )!.create();
    expect(
      buildPresentationStoryboard(
        harbor,
        "customer-solution-pack",
        "Harbor",
      ).architectureFlow.some((node) => node.label.includes("/")),
    ).toBe(false);
    expect(
      buildPresentationStoryboard(
        b,
        "customer-solution-pack",
        "Northstar",
        "technical",
      ).slides,
    ).toHaveLength(7);
    expect(
      buildPresentationStoryboard(b, "poc-kickoff-pack", "Northstar", "poc")
        .slides,
    ).toHaveLength(7);
    expect(safeStem("../CON")).not.toMatch(/[./\\]/);
  });
  test("applies distinct customer, internal, POC, and executive profile rules", () => {
    let bundle = northstarDeliverableCase();
    bundle = captureCaseItem(
      bundle,
      {
        kind: "diagnosis",
        title: "Internal diagnosis",
        body: "Synthetic internal diagnostic detail.",
        verificationState: "locally-validated",
        visibility: "internal",
      },
      NOW,
    );
    const diagnosis = bundle.items.at(-1)!;
    diagnosis.includeInInternalExport = true;
    diagnosis.includeInCustomerExport = false;
    expect(buildSolutionNarrative(bundle).dataFlow).not.toContainEqual(
      expect.objectContaining({ sourceItemIds: [diagnosis.id] }),
    );
    expect(
      buildSolutionNarrative(bundle, "internal-solution-review").dataFlow,
    ).toContainEqual(expect.objectContaining({ sourceItemIds: [diagnosis.id] }));
    expect(
      buildSolutionNarrative(bundle, "executive-takeaway").dataFlow,
    ).toHaveLength(0);
    expect(
      buildSolutionNarrative(bundle, "poc-kickoff-pack").successCriteria.length,
    ).toBeGreaterThan(0);
  });
});
test.describe("Deliverable binary and pack validation", () => {
  test("validates compact Letter and A4 briefs with traceable architecture", async () => {
    for (const pageSize of ["Letter", "A4"] as const) {
      const bundle = northstarDeliverableCase();
      const response = await POST(
        new Request("http://local/api/deliverables/generate", {
          method: "POST",
          body: JSON.stringify({
            caseBundle: bundle,
            profile: "customer-solution-pack",
            customerDisplayName: bundle.case.optionalCustomerDisplayName,
            pageSize,
          }),
        }),
      );
      expect(
        response.status,
        JSON.stringify(await response.clone().json()),
      ).toBe(200);
      const body = await response.json();
      expect(body.validations.pdf).toMatchObject({
        valid: true,
        pageCount: 1,
        checks: {
          metadataTitle: true,
          pageDimensions: true,
          contentStream: true,
          sectionHeadings: true,
          readableFont: true,
          noLiteralMarkdownLinks: true,
          withinLayoutBounds: true,
          architectureArrows: true,
        },
      });
      expect(body.brief.layout).toMatchObject({
        fit: true,
        clipped: false,
        pageSize,
        columnCount: 2,
        hasLiteralMarkdownLinks: false,
      });
      expect(body.brief.layout.fontSize).toBeGreaterThanOrEqual(8);
      expect(body.brief.layout.deduplicatedItemCount).toBe(0);
      expect(body.brief.layout.architectureArrowCount).toBe(
        body.brief.layout.architectureEdgeCount,
      );
      const pdfArtifact = body.artifacts.find(
        (artifact: { type: string }) => artifact.type === "brief-pdf",
      );
      const parsed = await PDFDocument.load(
        Buffer.from(pdfArtifact.base64, "base64"),
      );
      const dimensions = parsed.getPages()[0].getSize();
      expect(parsed.getTitle()).toContain("Technical Solution Brief");
      expect(dimensions.width).toBeCloseTo(pageSize === "A4" ? 595.28 : 612);
      expect(dimensions.height).toBeCloseTo(pageSize === "A4" ? 841.89 : 792);
    }
  });

  for (const scenario of SYNTHETIC_DELIVERABLE_SCENARIOS)
    test(`${scenario.id} generates structurally valid artifacts with expected gating`, async () => {
      const bundle = scenario.create();
      const response = await POST(
        new Request("http://local/api/deliverables/generate", {
          method: "POST",
          body: JSON.stringify({
            caseBundle: bundle,
            profile: "customer-solution-pack",
            customerDisplayName: bundle.case.optionalCustomerDisplayName,
            presentationType: scenario.id === "atlas" ? "technical" : "product",
          }),
        }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.schemaVersion).toBe(DELIVERABLES_SCHEMA_VERSION);
      expect(body.mermaid.valid).toBe(true);
      expect(body.brief.pageCount).toBe(1);
      expect(body.brief.layout).toMatchObject({ fit: true, clipped: false });
      expect(body.brief.layout.fontSize).toBeGreaterThanOrEqual(8);
      expect(body.brief.layout.columnCount).toBe(2);
      expect(body.brief.layout.hasLiteralMarkdownLinks).toBe(false);
      expect(body.brief.layout.expectedSectionHeadings).toEqual(
        body.brief.layout.renderedSectionHeadings,
      );
      expect(body.brief.layout.renderedSectionHeadings).toEqual(
        expect.arrayContaining([
          "Customer outcome",
          "Current challenge",
          "Recommended solution",
        ]),
      );
      expect(body.brief.layout.maxMeasuredWidth).toBeLessThanOrEqual(
        body.brief.layout.columnWidth + 0.5,
      );
      expect(
        body.brief.layout.columnHeights.every(
          (height: number) => height <= body.brief.layout.availableHeight + 0.5,
        ),
      ).toBe(true);
      expect(body.brief.layout.architectureArrowCount).toBe(
        body.brief.layout.architectureEdgeCount,
      );
      if (scenario.id === "northstar")
        expect(body.brief.layout.deduplicatedItemCount).toBe(0);
      expect(body.validations.pdf.valid).toBe(true);
      expect(Object.values(body.validations.pdf.checks).every(Boolean)).toBe(
        true,
      );
      expect(body.validations.presentation.valid).toBe(true);
      expect(body.validations.presentation.checks).toEqual({
        titleTypography: true,
        bodyTypography: true,
        boundedContent: true,
        noTruncation: true,
        nativeArchitecture: true,
        architectureStatusLabeling: true,
      });
      expect(body.validations.pack.valid).toBe(true);
      expect(body.project.schemaVersion).toBe(DELIVERABLES_SCHEMA_VERSION);
      expect(body.artifactRecords.length).toBeGreaterThan(5);
      const artifactRecordIds = body.artifactRecords.map(
        (artifact: { id: string }) => artifact.id,
      );
      expect(new Set(artifactRecordIds).size).toBe(artifactRecordIds.length);
      expect(new Set(body.project.artifactIds)).toEqual(
        new Set(artifactRecordIds),
      );
      for (const artifact of body.artifactRecords as {
        sourceItemIds: string[];
        privateItemIdsExcluded: string[];
      }[])
        expect(
          artifact.sourceItemIds.filter((id) =>
            artifact.privateItemIdsExcluded.includes(id),
          ),
        ).toHaveLength(0);
      const architectureFlowItem = bundle.items.find(
        (item) =>
          item.kind === "architecture-option" && /(?:→|->)/.test(item.body),
      );
      expect(architectureFlowItem).toBeTruthy();
      expect(
        body.artifactRecords.find(
          (artifact: { artifactType: string }) =>
            artifact.artifactType === "presentation-pptx",
        ).sourceItemIds,
      ).toContain(architectureFlowItem!.id);
      const artifacts = body.artifacts as {
        type: string;
        base64: string;
        valid: boolean;
        fileName: string;
        sha256: string;
        byteSize: number;
      }[];
      const pdfBytes = Buffer.from(
        artifacts.find((a) => a.type === "brief-pdf")!.base64,
        "base64",
      );
      const parsedPdf = await PDFDocument.load(pdfBytes);
      expect(parsedPdf.getPageCount()).toBe(1);
      expect(parsedPdf.getTitle()).toContain("Technical Solution Brief");
      const pptxBytes = Buffer.from(
        artifacts.find((a) => a.type === "presentation-pptx")!.base64,
        "base64",
      );
      const pptx = await JSZip.loadAsync(pptxBytes);
      expect(
        Object.keys(pptx.files).filter((x) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(x),
        ),
      ).toHaveLength(body.presentation.slideCount);
      expect(Object.keys(pptx.files).some((x) => x.includes("external"))).toBe(
        false,
      );
      const presentationXml = (
        await Promise.all(
          Object.entries(pptx.files)
            .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
            .map(([, file]) => file.async("string")),
        )
      ).join("\n");
      expect(presentationXml).toContain('name="Architecture node container 1"');
      expect(presentationXml).toContain('name="Architecture connector 1"');
      expect(presentationXml).not.toContain("…");
      const packArtifact = artifacts.find((a) => a.type === "solution-pack")!;
      expect(packArtifact.valid).toBe(
        scenario.id !== "lighthouse" || body.readiness.state !== "blocked",
      );
      expect(
        artifacts.find((artifact) => artifact.type === "internal-reviewer-brief")
          ?.valid,
      ).toBe(true);
      if (scenario.id === "lighthouse") {
        expect(
          artifacts.find((artifact) => artifact.type === "presentation-pptx")
            ?.valid,
        ).toBe(false);
        expect(
          bundle.items.some(
            (item) =>
              item.kind === "decision" &&
              item.structuredData.decisionStatus === "accepted",
          ),
        ).toBe(false);
      }
      const pack = await JSZip.loadAsync(
        Buffer.from(packArtifact.base64, "base64"),
      );
      const paths = Object.keys(pack.files);
      expect(paths).toEqual(
        expect.arrayContaining([
          "README.md",
          "manifest.json",
          "evidence/source-manifest.json",
          "architecture/architecture-description.md",
          "presentation/presentation-storyboard.md",
        ]),
      );
      expect(
        paths.some(
          (x) => x.includes("..") || x.startsWith("/") || x.startsWith("."),
        ),
      ).toBe(false);
      expect(paths.some((path) => path.endsWith(".mmd"))).toBe(true);
      expect(paths.some((path) => path.endsWith(".svg"))).toBe(true);
      expect(paths.some((path) => path.endsWith(".pdf"))).toBe(true);
      expect(paths.some((path) => path.endsWith(".pptx"))).toBe(true);
      expect(paths).toContain("presentation/speaker-notes.md");
      expect(
        await pack.file("presentation/speaker-notes.md")!.async("string"),
      ).toContain(architectureFlowItem!.id);
      expect(paths).toContain("evidence/sources.md");
      const sourceArtifact = artifacts.find(
        (artifact) => artifact.type === "source-manifest",
      )!;
      const sourceManifest = JSON.parse(
        Buffer.from(sourceArtifact.base64, "base64").toString("utf8"),
      ) as {
        references: {
          artifactIds: string[];
          claimIds: string[];
        }[];
      };
      for (const reference of sourceManifest.references) {
        expect(reference.artifactIds.length).toBeGreaterThan(0);
        expect(
          reference.artifactIds.every((id) => artifactRecordIds.includes(id)),
        ).toBe(true);
      }
      const referencesById = new Map(
        sourceManifest.references.map((reference) => [
          `source-${reference.claimIds[0] ?? ""}`,
          reference,
        ]),
      );
      for (const artifact of body.artifactRecords as {
        sourceItemIds: string[];
        sourceReferenceIds: string[];
      }[])
        for (const referenceId of artifact.sourceReferenceIds) {
          const reference = referencesById.get(referenceId);
          expect(reference, referenceId).toBeTruthy();
          expect(
            reference!.claimIds.some((id) =>
              artifact.sourceItemIds.includes(id),
            ),
          ).toBe(true);
        }
      const manifest = JSON.parse(
        await pack.file("manifest.json")!.async("string"),
      ) as { files: { path: string; sha256: string; byteSize: number }[] };
      for (const entry of manifest.files) {
        const packed = await pack.file(entry.path)!.async("nodebuffer");
        expect(packed.byteLength).toBe(entry.byteSize);
        expect(createHash("sha256").update(packed).digest("hex")).toBe(
          entry.sha256,
        );
      }
      const relationships = await Promise.all(
        Object.entries(pptx.files)
          .filter(([path]) => path.endsWith(".rels"))
          .map(([, file]) => file.async("string")),
      );
      expect(relationships.join("\n")).not.toContain('TargetMode="External"');
      expect(JSON.stringify(body)).not.toMatch(
        /dg_[A-Za-z0-9_-]{12,}|BEGIN PRIVATE KEY|C:\\Users\\/,
      );
    });

  test("includes only a manifest-tracked redacted case and re-audits manual edits", async () => {
    const secret = "dg_abcdefghijklmnop";
    const bundle = northstarDeliverableCase();
    (bundle.items[0] as unknown as Record<string, unknown>).rawTranscript =
      `private transcript ${secret}`;
    bundle.items[0].body += ` Authorization: Token ${secret}`;
    bundle.items[0].structuredData = {
      ...bundle.items[0].structuredData,
      nested: { accessToken: secret },
    };
    const response = await POST(
      new Request("http://local/api/deliverables/generate", {
        method: "POST",
        body: JSON.stringify({
          caseBundle: bundle,
          profile: "customer-solution-pack",
          customerDisplayName: "Northstar Appointments",
          includeRedactedCase: true,
          manualEdits: {
            executiveSummary: "A provisional field summary requiring evidence review.",
            sectionWording:
              "The customer confirmed that representative scenarios meet the agreed task, latency, safety, and recovery acceptance checks.",
            openQuestions: [
              "Confirm the final POC owner.",
              "Confirm the final POC owner.",
            ],
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.editAudit.status).toBe("qualified");
    expect(body.readiness.state).toBe("draft");
    expect(body.brief.layout.deduplicatedItemCount).toBeGreaterThan(0);
    expect(body.artifactRecords.some((artifact: { userEdited: boolean }) => artifact.userEdited)).toBe(true);
    const packArtifact = body.artifacts.find(
      (artifact: { type: string }) => artifact.type === "solution-pack",
    );
    const pack = await JSZip.loadAsync(
      Buffer.from(packArtifact.base64, "base64"),
    );
    const redactedCase = await pack
      .file("case/redacted-solution-case.json")!
      .async("string");
    expect(redactedCase).not.toMatch(/abcdefghijklmnop|rawTranscript|accessToken|private transcript/i);
    const manifest = JSON.parse(
      await pack.file("manifest.json")!.async("string"),
    ) as { files: { path: string; sha256: string }[] };
    expect(manifest.files.some((entry) => entry.path === "case/redacted-solution-case.json")).toBe(true);
  });

  test("rejects syntactically invalid manually edited Mermaid", async () => {
    const response = await POST(
      new Request("http://local/api/deliverables/generate", {
        method: "POST",
        body: JSON.stringify({
          caseBundle: northstarDeliverableCase(),
          profile: "customer-solution-pack",
          customerDisplayName: "Northstar",
          mermaidSource: "flowchart LR\nthis is not valid Mermaid",
        }),
      }),
    );
    expect(response.status).toBe(422);
  });
  test("qualifies syntactically safe unsupported Mermaid edits", async () => {
    const bundle = northstarDeliverableCase();
    const generated = generateMermaid(bundle).source;
    const response = await POST(
      new Request("http://local/api/deliverables/generate", {
        method: "POST",
        body: JSON.stringify({
          caseBundle: bundle,
          profile: "customer-solution-pack",
          customerDisplayName: "Northstar",
          mermaidSource: `${generated}\n  n99["Unsupported external service"]`,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.editAudit.status).toBe("qualified");
    expect(body.readiness.state).toBe("draft");
    expect(body.mermaid.valid).toBe(true);
    expect(body.mermaid.userEdited).toBe(true);
  });
  test("uses unique project-scoped artifact IDs for every regeneration", async () => {
    const request = () =>
      POST(
        new Request("http://local/api/deliverables/generate", {
          method: "POST",
          body: JSON.stringify({
            caseBundle: northstarDeliverableCase(),
            profile: "customer-solution-pack",
            customerDisplayName: "Northstar",
          }),
        }),
      );
    const [first, second] = await Promise.all([request(), request()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [a, b] = await Promise.all([first.json(), second.json()]);
    expect(a.project.id).not.toBe(b.project.id);
    expect(
      a.artifactRecords.some((artifact: { id: string }) =>
        b.artifactRecords.some(
          (candidate: { id: string }) => candidate.id === artifact.id,
        ),
      ),
    ).toBe(false);
  });
  test("scopes manual-edit provenance to artifacts whose bytes can change", async () => {
    const response = await POST(
      new Request("http://local/api/deliverables/generate", {
        method: "POST",
        body: JSON.stringify({
          caseBundle: northstarDeliverableCase(),
          profile: "customer-solution-pack",
          customerDisplayName: "Northstar",
          manualEdits: { slideTitles: ["Outcome and evidence"] },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const editedTypes = body.artifactRecords
      .filter((artifact: { userEdited: boolean }) => artifact.userEdited)
      .map((artifact: { artifactType: string }) => artifact.artifactType)
      .sort();
    expect(editedTypes).toEqual(
      [
        "presentation-pptx",
        "presentation-storyboard",
        "solution-pack",
        "source-manifest",
        "speaker-notes",
      ].sort(),
    );
    for (const artifact of body.artifactRecords.filter(
      (candidate: { userEdited: boolean }) => !candidate.userEdited,
    ))
      expect(artifact.sourceReferenceIds).not.toContain("source-user-edits");
  });
});
