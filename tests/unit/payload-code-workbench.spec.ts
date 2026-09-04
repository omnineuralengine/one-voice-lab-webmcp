import { expect, test } from "@playwright/test";

import {
  API_LAB_WORKBENCH_HANDOFF_KEY,
  analyzeTechnicalArtifact,
  buildApiLabWorkbenchHandoff,
  buildTechnicalArtifactDocsQuery,
  detectTechnicalArtifact,
  generateTechnicalArtifactVariants,
  parseTechnicalArtifact,
  parseTechnicalArtifactSession,
  redactTechnicalArtifactInput,
  serializeTechnicalArtifact,
  serializeTechnicalArtifactSession,
  technicalArtifactToMarkdown,
  toSessionSafeTechnicalArtifact,
} from "@/lib/payload-code-workbench";
import {
  apiLabWorkbenchHandoffSchema,
  technicalArtifactSchema,
  technicalArtifactSessionSchema,
} from "@/types/payload-code-workbench";

const NOW = "2026-07-28T14:00:00.000Z";

test.describe("Payload & Code Workbench deterministic core", () => {
  test("validates a redacted-only artifact schema and rejects persisted raw input", () => {
    const artifact = analyzeTechnicalArtifact({
      input: '{"model":"nova-3","smart_format":true}',
      id: "artifact-schema",
      now: NOW,
    });

    expect(technicalArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(artifact.rawInput).toBeNull();
    expect(artifact.provenance).toMatchObject({
      originalRetained: false,
      persistedRepresentation: "redacted-only",
      executed: false,
    });
    expect(() => technicalArtifactSchema.parse({ ...artifact, rawInput: "must not persist" })).toThrow();
  });

  test("detects structured artifact types without semantic guessing", () => {
    const cases = [
      ['{"model":"nova-3"}', "json-payload", "json", "high"],
      ['{"results":[],"metadata":{"request_id":"fixture"}}', "json-response", "json", "high"],
      ['{"event":"one"}\n{"event":"two"}', "jsonl", "jsonl", "high"],
      ["curl --request POST --url https://api.deepgram.com/v1/listen", "curl", "bash", "high"],
      ['const response = fetch("https://api.deepgram.com/v1/models");', "javascript", "javascript", "medium"],
      ["interface Result { transcript: string }", "typescript", "typescript", "medium"],
      ["import requests\nresponse = requests.get('https://api.deepgram.com/v1/models')", "python", "python", "medium"],
      ["POST /v1/listen HTTP/1.1\nHost: api.deepgram.com", "raw-http-request", "http", "high"],
      ["HTTP/1.1 429 Too Many Requests\nContent-Type: application/json", "raw-http-response", "http", "high"],
      ["2026-07-28T14:00:00Z INFO request_id=req_fixture status=200", "application-log", "log", "medium"],
      ["TypeError: socket is not open\n    at send (client.ts:4:2)", "error-message", "log", "medium"],
    ] as const;

    for (const [input, artifactType, language, confidence] of cases) {
      expect(detectTechnicalArtifact(input)).toMatchObject({ artifactType, detectedLanguage: language, confidence });
    }
    expect(detectTechnicalArtifact("A short unstructured note").artifactType).toBe("plain-text");
    expect(detectTechnicalArtifact("").artifactType).toBe("unknown");
  });

  test("redacts broad credential classes without retaining secret values in findings", () => {
    const secrets = {
      deepgram: "dg_abcdefghijklmnopqrstuvwx",
      bearer: "bearer-fixture-abcdefghijklmnop",
      openai: "openai-key-public-fixture",
      github: "github-token-public-fixture",
      awsSecret: "awsSecretFixture1234567890+/=",
      google: "AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJlZml4dHVyZQ",
      generic: "genericSecretFixture123456",
      cookie: "session=private-cookie-fixture",
      signed: "signed-url-fixture-1234567890",
      legacyDeepgram: "0123456789abcdef0123456789abcdef01234567",
      bareToken: "unprefixed-token-fixture-1234567890",
    };
    const pasted = [
      `DEEPGRAM_API_KEY=${secrets.deepgram}`,
      `Authorization: Bearer ${secrets.bearer}`,
      `OPENAI_API_KEY=${secrets.openai}`,
      `github_token=${secrets.github}`,
      `AWS_SECRET_ACCESS_KEY=${secrets.awsSecret}`,
      `google_api_key=${secrets.google}`,
      `temporary_token=${secrets.jwt}`,
      `client_secret=${secrets.generic}`,
      `Cookie: ${secrets.cookie}`,
      `https://audio.example/file?X-Amz-Signature=${secrets.signed}`,
      `const client = createClient("${secrets.legacyDeepgram}")`,
      `GITHUB_TOKEN=${secrets.bareToken}`,
    ].join("\n");

    const redaction = redactTechnicalArtifactInput(pasted);
    const secretValues = Object.values(secrets);
    for (const secret of secretValues) {
      expect(redaction.value).not.toContain(secret);
      expect(JSON.stringify(redaction.findings)).not.toContain(secret);
    }
    expect(redaction.findings.length).toBeGreaterThanOrEqual(8);
    expect(redaction.findings.every((finding) => finding.confidence === "high" && finding.count > 0)).toBe(true);
    expect(redaction.value).toMatch(/\[REDACTED_(?:DEEPGRAM_KEY|BEARER_TOKEN|API_KEY|SECRET|COOKIE|PRIVATE_KEY)/);
  });

  test("reports invalid JSON location and offers a separate deterministic repair", () => {
    const artifact = analyzeTechnicalArtifact({
      input: '{"model":"nova-3","smart_format":true,}',
      artifactType: "json-payload",
      detectedLanguage: "json",
      id: "invalid-json",
      now: NOW,
    });

    expect(artifact.validationStatus).toBe("invalid");
    expect(artifact.validationErrors).toContainEqual(expect.objectContaining({
      classification: "confirmed-syntax-problem",
      severity: "error",
      line: 1,
    }));
    expect(artifact.suggestedFixes).toContainEqual(expect.objectContaining({
      source: "deterministic",
      replacement: '{\n  "model": "nova-3",\n  "smart_format": true\n}',
    }));
    expect(artifact.formattedInput).toContain("smart_format");
  });

  test("parses cURL, records a local file reference, and never reads file contents", () => {
    const artifact = analyzeTechnicalArtifact({
      input: [
        "curl --request POST \\",
        "  --url 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true' \\",
        "  --header 'Authorization: Token dg_filefixtureabcdefghijkl' \\",
        "  --header 'Content-Type: audio/wav' \\",
        "  --data-binary '@C:\\private\\customer-audio.wav'",
      ].join("\n"),
      id: "curl-file",
      now: NOW,
    });

    const request = artifact.normalizedRepresentation.request;
    expect(artifact.artifactType).toBe("curl");
    expect(request).toMatchObject({ method: "POST", hostname: "api.deepgram.com", shell: "posix", lineContinuation: "backslash" });
    expect(request?.fileReferences).toEqual(["[LOCAL_FILE:customer-audio.wav]"]);
    expect(request?.body).toBeNull();
    expect(artifact.redactedInput).not.toContain("dg_filefixtureabcdefghijkl");
    expect(artifact.validationErrors).toContainEqual(expect.objectContaining({ id: "file-reference" }));
  });

  test("recognizes PowerShell request syntax and backtick continuation without executing it", () => {
    const artifact = analyzeTechnicalArtifact({
      input: [
        "Invoke-RestMethod `",
        "  -Method POST `",
        "  -Uri 'https://api.deepgram.com/v1/listen?model=nova-3' `",
        "  -Body '{\"url\":\"https://audio.example/fixture.wav\"}'",
      ].join("\n"),
      id: "powershell-request",
      now: NOW,
    });

    expect(artifact).toMatchObject({
      artifactType: "curl",
      detectedLanguage: "powershell",
      extractedEndpoint: "stt-prerecorded",
      extractedMethod: "POST",
    });
    expect(artifact.normalizedRepresentation.request).toMatchObject({
      shell: "powershell",
      lineContinuation: "backtick",
    });
    expect(artifact.provenance.executed).toBe(false);
  });

  test("extracts only observed Deepgram endpoint, model, and registered features", () => {
    const artifact = prerecordedArtifact();

    expect(artifact).toMatchObject({
      detectedProvider: "deepgram",
      extractedEndpoint: "stt-prerecorded",
      extractedMethod: "POST",
      extractedModel: "nova-3",
    });
    expect(artifact.extractedFeatures).toEqual(expect.arrayContaining(["smart_format", "diarize"]));
    expect(artifact.extractedFeatures).not.toContain("imagined_requirement");
    expect(artifact.relatedDocumentation).toHaveLength(1);
    expect(artifact.relatedDocumentation[0].canonicalUrl).toMatch(/^https:\/\/developers\.deepgram\.com\//);
  });

  test("parses raw HTTP request and response details without exposing sensitive headers", () => {
    const request = analyzeTechnicalArtifact({
      input: "POST /v1/listen?model=nova-3&punctuate=true HTTP/1.1\nHost: api.deepgram.com\nAuthorization: Token rawhttpfixtureabcdefghijkl\nContent-Type: application/json\n\n{\"url\":\"https://audio.example/fixture.wav\"}",
      id: "raw-request",
      now: NOW,
    });
    expect(request).toMatchObject({ artifactType: "raw-http-request", extractedEndpoint: "stt-prerecorded", extractedMethod: "POST" });
    expect(request.extractedHeaders.authorization).toContain("[REDACTED_BEARER_TOKEN]");
    expect(JSON.stringify(request)).not.toContain("rawhttpfixtureabcdefghijkl");

    const response = analyzeTechnicalArtifact({
      input: "HTTP/1.1 429 Too Many Requests\nContent-Type: application/json\nDG-Request-ID: req_fixture\nSet-Cookie: session=private-value\n\n{\"error_code\":\"RATE_LIMITED\",\"message\":\"retry later\"}",
      id: "raw-response",
      now: NOW,
    });
    expect(response).toMatchObject({ artifactType: "raw-http-response", extractedStatusCode: 429, extractedErrorCode: "RATE_LIMITED" });
    expect(response.normalizedRepresentation.response?.requestId).toBe("req_fixture");
    expect(JSON.stringify(response)).not.toContain("session=private-value");
  });

  test("extracts status and error code from logs while retaining deterministic labels", () => {
    const log = analyzeTechnicalArtifact({
      input: "2026-07-28T14:00:00Z WARN request_id=req_fixture status=429 code=TOO_MANY_REQUESTS",
      id: "log",
      now: NOW,
    });
    const error = analyzeTechnicalArtifact({
      input: "TypeError: WebSocket closed before final transcript",
      id: "error",
      now: NOW,
    });

    expect(log).toMatchObject({ artifactType: "application-log", extractedStatusCode: 429, extractedErrorCode: "TOO_MANY_REQUESTS" });
    expect(log.normalizedRepresentation.parserNotes.join(" ")).toContain("not submitted or executed");
    expect(error.artifactType).toBe("error-message");
  });

  test("builds a focused docs query from extracted facts, never raw body or credentials", () => {
    const artifact = prerecordedArtifact();
    const query = buildTechnicalArtifactDocsQuery(artifact);

    expect(query).toContain("Registry endpoint: stt-prerecorded");
    expect(query).toContain("Observed model value: nova-3");
    expect(query).toContain("smart_format");
    expect(query).not.toContain("Customer private sentence");
    expect(query).not.toContain("dg_workbenchfixtureabcdefghijkl");
    expect(query.length).toBeLessThanOrEqual(2_000);
  });

  test("generates five redacted variants with environment placeholders and no success claim", () => {
    const artifact = prerecordedArtifact();
    const variants = generateTechnicalArtifactVariants(artifact);
    const text = variants.map((variant) => variant.code).join("\n");

    expect(variants.map((variant) => variant.language)).toEqual(["curl", "javascript", "typescript", "python", "raw-http"]);
    expect(variants.every((variant) => variant.notes.some((note) => /not executed/i.test(note)))).toBe(true);
    expect(text).toContain("DEEPGRAM_API_KEY");
    expect(text).not.toContain("dg_workbenchfixtureabcdefghijkl");
    expect(text).not.toMatch(/request (?:succeeded|was successful)/i);
  });

  test("builds a supported API Lab handoff that cannot execute or transfer secrets", () => {
    const artifact = prerecordedArtifact();
    const handoff = buildApiLabWorkbenchHandoff(artifact, { sourceDiagnosisId: "sdk-doctor-fixture" });

    expect(API_LAB_WORKBENCH_HANDOFF_KEY).toBe("deepgram-payload-code-workbench:api-lab-handoff:v1");
    expect(apiLabWorkbenchHandoffSchema.parse(handoff)).toEqual(handoff);
    expect(handoff).toMatchObject({
      endpointId: "stt-prerecorded",
      autoExecute: false,
      requiresVisibleConfirmation: true,
      demoModePreserved: true,
      authentication: "server-placeholder-only",
      sourceDiagnosisId: "sdk-doctor-fixture",
    });
    expect(handoff.query).toMatchObject({ model: "nova-3", smart_format: "true", diarize: "true" });
    expect(handoff.body).toEqual({ url: "https://audio.example/fixture.wav" });
    expect(handoff.transferredFields).toEqual(expect.arrayContaining(["query.model", "query.smart_format", "body.url"]));
    expect(handoff.notTransferred.join(" ")).toContain("unknown_field");
    expect(handoff.headers.authorization).toBe("Token ${DEEPGRAM_API_KEY}");
    expect(JSON.stringify(handoff)).not.toContain("dg_workbenchfixtureabcdefghijkl");
    expect(handoff.href).toBe("/?module=api-studio&operation=stt-prerecorded&source=payload-workbench");
    expect(handoff.href).not.toContain("model=");
  });

  test("serializes sessions with redacted representations only and rejects malformed snapshots", () => {
    const secret = "dg_latefixtureabcdefghijklmnop";
    const artifact = prerecordedArtifact();
    const unsafe = {
      ...artifact,
      rawInput: `PRIVATE RAW ${secret}`,
      takeaway: `api_key=${secret}`,
      customerContext: `private context Authorization: Bearer ${secret}`,
    };

    const safe = toSessionSafeTechnicalArtifact(unsafe);
    const serialized = serializeTechnicalArtifact(unsafe);
    const session = serializeTechnicalArtifactSession([unsafe]);

    expect(safe.rawInput).toBeNull();
    expect(serialized).not.toMatch(/PRIVATE RAW|dg_latefixture/);
    expect(session).not.toMatch(/PRIVATE RAW|dg_latefixture/);
    expect(parseTechnicalArtifact(serialized)).toEqual(safe);
    expect(parseTechnicalArtifactSession(session)).toEqual([safe]);
    expect(technicalArtifactSessionSchema.parse(JSON.parse(session)).artifacts).toHaveLength(1);
    expect(parseTechnicalArtifact("not json")).toBeNull();
    expect(parseTechnicalArtifactSession('{"schemaVersion":1,"artifacts":"bad"}')).toBeNull();
  });

  test("exports redacted Markdown without raw input, secrets, or private customer context", () => {
    const secret = "dg_markdownfixtureabcdefghijkl";
    const artifact = {
      ...prerecordedArtifact(),
      rawInput: `PRIVATE RAW TRANSCRIPT ${secret}`,
      takeaway: `Use server boundary; api_key=${secret}`,
      customerContext: "PRIVATE CUSTOMER CONTEXT MUST STAY INTERNAL",
    };
    const markdown = technicalArtifactToMarkdown(artifact);

    expect(markdown).toContain("### Transcribe Prerecorded Audio");
    expect(markdown).toContain("**Method:** `POST`");
    expect(markdown).toContain("**Deterministic validation**");
    expect(markdown).toContain("**Official documentation**");
    expect(markdown).toContain("[REDACTED_DEEPGRAM_KEY]");
    expect(markdown).not.toMatch(/PRIVATE RAW TRANSCRIPT|PRIVATE CUSTOMER CONTEXT|dg_markdownfixture/);
    expect(technicalArtifactToMarkdown({ ...artifact, includeInExport: false })).toBe("");
  });
});

function prerecordedArtifact() {
  return analyzeTechnicalArtifact({
    input: [
      "curl --request POST \\",
      "  --url 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&diarize=true' \\",
      "  --header 'Authorization: Token dg_workbenchfixtureabcdefghijkl' \\",
      "  --header 'Content-Type: application/json' \\",
      "  --data '{\"url\":\"https://audio.example/fixture.wav\",\"unknown_field\":\"Customer private sentence\"}'",
    ].join("\n"),
    id: "prerecorded-fixture",
    sessionId: "session-fixture",
    now: NOW,
    title: "Transcribe Prerecorded Audio request",
  });
}
