import { z } from "zod";

import { getActionDefinition } from "@/lib/actions/registry";
import { providerCatalogIdSchema } from "@/lib/providers/platform-types";
import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import { publicLabSchema } from "@/lib/public-evidence/lab";
import {
  publicErrorSchema,
  publicEvalSchema,
  publicEvidenceTypeSchema,
  publicMethodologySchema,
  publicProviderSchema,
  publicProviderStateSchema,
  publicSyntheticEvalResultSchema,
} from "@/lib/public-evidence/schemas";

export const openApiDocumentSchema = z.object({
  openapi: z.literal("3.1.0"),
  info: z.object({
    title: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
  }),
  servers: z.array(z.object({ url: z.string().url() })).min(1),
  paths: z.record(z.string().startsWith("/"), z.record(z.string(), z.unknown())),
  components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
}).passthrough();

type JsonSchema = Record<string, unknown>;

/**
 * OpenAPI 3.1 uses the JSON Schema 2020-12 vocabulary. Generate component
 * schemas from the same Zod contracts used by public actions and routes, then
 * remove only the standalone-document dialect marker.
 */
function jsonSchemaFromZod(
  schema: z.ZodType,
  io: "input" | "output" = "output",
): JsonSchema {
  const generated = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
    reused: "inline",
  }) as JsonSchema;
  const componentSchema = { ...generated };
  delete componentSchema.$schema;
  return componentSchema;
}

const envelopeProperties = {
  schemaVersion: { type: "string", const: "1.0.0" },
  generatedAt: { type: "string", format: "date-time" },
  canonicalUrl: { type: "string", format: "uri" },
  evidenceType: { $ref: "#/components/schemas/EvidenceType" },
  lastVerifiedAt: { type: "string", format: "date" },
  data: {},
};

function jsonResponse(description: string, dataRef: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(envelopeProperties),
          properties: {
            ...envelopeProperties,
            data: { $ref: dataRef },
          },
        },
      },
    },
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  };
}

function providerListResponse() {
  return {
    ...jsonResponse("Bounded provider catalog page.", "#/components/schemas/ProviderList"),
    headers: {
      "X-Result-Count": { description: "Number of provider records in this page.", schema: { type: "integer", minimum: 0, maximum: 50 } },
      "X-Total-Matched": { description: "Count after safe metadata filters and before pagination.", schema: { type: "integer", minimum: 0 } },
      "X-Next-Cursor": { description: "Stable provider ID cursor for the next page; omitted at the end.", schema: { $ref: "#/components/schemas/ProviderCatalogId" } },
    },
  };
}

const notFoundResponse = errorResponse("The stable public ID was not found.");
const validationResponse = errorResponse("The request did not match the canonical public action schema.");
const rateLimitResponse = errorResponse("The bounded public read limit was exceeded.");

const providerParameter = {
  name: "provider",
  in: "path",
  required: true,
  schema: { $ref: "#/components/schemas/ProviderCatalogId" },
  description: "An open stable catalog ID returned by listProviders; catalog membership does not imply an installed adapter.",
};

const evalParameter = {
  name: "eval",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
  description: "Stable evaluation ID returned by listEvals.",
};

const methodologyParameter = {
  name: "methodology",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$" },
  description: "Stable methodology ID returned by listBenchmarkMethodologies.",
};

export function getOpenApiDocument(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return openApiDocumentSchema.parse({
    openapi: "3.1.0",
    info: {
      title: "ONE Voice Lab public evidence API",
      version: "1.1.0",
      description: "Public, evidence-labeled provider metadata and deterministic benchmark evidence. Provider capability, model, voice, and health reads use local curated or cached state and never invoke provider APIs. Benchmark methodology, leaderboard, fixture, and integrity operations are nonbillable and expose no administrative action, credential, or signing key. Synthetic and catalog evidence does not establish provider quality or production readiness.",
    },
    servers: [{ url: getCanonicalUrl("/", environment).replace(/\/$/, "") }],
    paths: {
      "/api/public/v1/lab": {
        get: {
          operationId: "getLab",
          summary: "Get the public lab index and execution safety boundary.",
          responses: { "200": jsonResponse("Public lab index.", "#/components/schemas/Lab") },
        },
      },
      "/api/public/v1/providers": {
        get: {
          operationId: "listProviders",
          "x-one-action": "providers.list",
          summary: "List evidence-labeled provider catalog records without secret names or values.",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { $ref: "#/components/schemas/ProviderListQuery/properties/limit" }, description: "Bounded page size; defaults to 25." },
            { name: "after", in: "query", required: false, schema: { $ref: "#/components/schemas/ProviderListQuery/properties/after" }, description: "Stable provider-ID cursor from the preceding page." },
            { name: "group", in: "query", required: false, schema: { $ref: "#/components/schemas/ProviderListQuery/properties/group" }, description: "Optional catalog-group filter." },
            { name: "kind", in: "query", required: false, schema: { $ref: "#/components/schemas/ProviderListQuery/properties/kind" }, description: "Optional provider, runtime, infrastructure, or evaluation-system kind filter." },
            { name: "capability", in: "query", required: false, schema: { $ref: "#/components/schemas/ProviderListQuery/properties/capabilityId" }, description: "Optional normalized declared-capability filter." },
          ],
          responses: {
            "200": providerListResponse(),
            "400": validationResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/providers/{provider}": {
        get: {
          operationId: "getProvider",
          "x-one-action": "providers.get",
          summary: "Get one provider by its open stable catalog ID.",
          parameters: [providerParameter],
          responses: {
            "200": jsonResponse("Provider catalog record.", "#/components/schemas/Provider"),
            "404": notFoundResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/providers/{provider}/capabilities": {
        get: {
          operationId: "listProviderCapabilities",
          "x-one-action": "providers.listCapabilities",
          summary: "List normalized capability declarations with provenance and verification state.",
          description: "A provider-documented capability is not an installed adapter, live-enabled feature, benchmark result, or public ranking.",
          parameters: [providerParameter],
          responses: {
            "200": jsonResponse("Provider capability declarations.", "#/components/schemas/ProviderCapabilities"),
            "404": notFoundResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/providers/{provider}/models": {
        get: {
          operationId: "listProviderModels",
          "x-one-action": "providers.listModels",
          summary: "List curated or cached public model metadata.",
          description: "This route never performs live upstream discovery. An unavailable response is truthful when no public-safe catalog has been curated or cached.",
          parameters: [providerParameter],
          responses: {
            "200": jsonResponse("Public-safe provider model metadata.", "#/components/schemas/ProviderModels"),
            "404": notFoundResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/providers/{provider}/voices": {
        get: {
          operationId: "listProviderVoices",
          "x-one-action": "providers.listVoices",
          summary: "List curated public-safe voice metadata.",
          description: "This route does not expose account-scoped voice catalogs and never performs live upstream discovery.",
          parameters: [providerParameter],
          responses: {
            "200": jsonResponse("Public-safe provider voice metadata.", "#/components/schemas/ProviderVoices"),
            "404": notFoundResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/providers/{provider}/health": {
        get: {
          operationId: "getProviderHealth",
          "x-one-action": "providers.getHealth",
          summary: "Read bounded local or cached readiness and health state.",
          description: "Health describes operational readiness, not benchmark performance, and this route does not poll a provider.",
          parameters: [providerParameter],
          responses: {
            "200": jsonResponse("Provider readiness and health metadata.", "#/components/schemas/ProviderHealth"),
            "404": notFoundResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/evals": {
        get: {
          operationId: "listEvals",
          "x-one-action": "evaluations.list",
          summary: "List reproducible evaluation definitions and evidence boundaries.",
          responses: { "200": jsonResponse("Evaluation registry.", "#/components/schemas/EvalList") },
        },
      },
      "/api/public/v1/evals/{eval}": {
        get: {
          operationId: "getEval",
          "x-one-action": "evaluations.get",
          summary: "Get one evaluation definition by its stable slug.",
          parameters: [evalParameter],
          responses: {
            "200": jsonResponse("Evaluation definition.", "#/components/schemas/Eval"),
            "404": notFoundResponse,
          },
        },
      },
      "/api/public/v1/evals/{eval}/run": {
        post: {
          operationId: "runSyntheticEval",
          "x-one-action": "publicEvaluation.runSynthetic",
          summary: "Run an existing deterministic local fixture without a provider call or billable action.",
          description: "No request body or remote URL is accepted. The stable eval ID selects repository-owned fixture logic. The result remains simulated and may require human review.",
          parameters: [evalParameter],
          responses: {
            "200": jsonResponse("Structured simulated result.", "#/components/schemas/SyntheticEvalResult"),
            "404": notFoundResponse,
          },
        },
      },
      "/api/public/v1/methodology": {
        get: {
          operationId: "getMethodology",
          "x-one-action": "methodology.get",
          summary: "Get the public evidence vocabulary, comparison principles, and safety constraints.",
          responses: { "200": jsonResponse("Evaluation methodology.", "#/components/schemas/Methodology") },
        },
      },
      "/api/public/v1/methodologies": {
        get: {
          operationId: "listBenchmarkMethodologies",
          "x-one-action": "benchmark.listMethodologies",
          summary: "List the versioned canonical benchmark methodology contracts.",
          responses: {
            "200": jsonResponse("Canonical benchmark methodologies.", "#/components/schemas/BenchmarkMethodologyList"),
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/methodologies/{methodology}": {
        get: {
          operationId: "getBenchmarkMethodology",
          "x-one-action": "benchmark.inspectMethodology",
          summary: "Get one exact canonical benchmark methodology and version.",
          parameters: [
            methodologyParameter,
            {
              name: "version",
              in: "query",
              required: false,
              schema: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$", default: "1.0.0" },
              description: "Exact semantic version; defaults to 1.0.0.",
            },
          ],
          responses: {
            "200": jsonResponse("Canonical benchmark methodology.", "#/components/schemas/BenchmarkMethodology"),
            "400": validationResponse,
            "404": notFoundResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/leaderboards": {
        get: {
          operationId: "listLeaderboardSnapshots",
          "x-one-action": "benchmark.listLeaderboardSnapshots",
          summary: "List bounded public-verified leaderboard snapshot metadata.",
          description: "An empty list truthfully means no public-verified snapshots are available. This route does not publish, mutate, or manufacture rankings.",
          parameters: [
            { name: "suiteId", in: "query", required: false, schema: { type: "string", maxLength: 160 }, description: "Optional stable suite ID filter." },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 }, description: "Bounded page size." },
            { name: "beforeAsOf", in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Keyset timestamp; must be paired with beforeId." },
            { name: "beforeId", in: "query", required: false, schema: { type: "string", format: "uuid" }, description: "Keyset snapshot ID; must be paired with beforeAsOf." },
          ],
          responses: {
            "200": jsonResponse("Public-verified leaderboard snapshot metadata.", "#/components/schemas/LeaderboardList"),
            "400": validationResponse,
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/leaderboards/fixture": {
        get: {
          operationId: "getFixtureLeaderboard",
          "x-one-action": "benchmark.fixtureLeaderboard",
          summary: "Get the deterministic simulated fixture leaderboard.",
          description: "The fixture is non-public evidence, is not a provider-performance claim, and makes no provider call.",
          responses: {
            "200": jsonResponse("Synthetic fixture leaderboard.", "#/components/schemas/FixtureLeaderboard"),
            "429": rateLimitResponse,
          },
        },
      },
      "/api/public/v1/benchmarks/verify": {
        post: {
          operationId: "verifyBenchmarkResult",
          "x-one-action": "benchmark.verifyResultIntegrity",
          summary: "Recompute canonical SHA-256 integrity for one supplied benchmark result.",
          description: "Hash verification is bounded local computation. It does not sign, publish, trust, or execute the result and does not use a provider or signing key.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/BenchmarkVerificationRequest" } },
            },
          },
          responses: {
            "200": jsonResponse("Benchmark hash verification state.", "#/components/schemas/BenchmarkVerificationResult"),
            "400": validationResponse,
            "413": errorResponse("The bounded verification input exceeds 2.1 MB."),
            "429": rateLimitResponse,
          },
        },
      },
    },
    components: {
      schemas: {
        EvidenceType: jsonSchemaFromZod(publicEvidenceTypeSchema),
        ProviderCatalogId: jsonSchemaFromZod(providerCatalogIdSchema),
        ProviderListQuery: jsonSchemaFromZod(getActionDefinition("providers.list").inputSchema, "input"),
        ProviderState: jsonSchemaFromZod(publicProviderStateSchema),
        Provider: jsonSchemaFromZod(publicProviderSchema),
        ProviderList: jsonSchemaFromZod(z.array(publicProviderSchema)),
        ProviderCapabilities: jsonSchemaFromZod(getActionDefinition("providers.listCapabilities").outputSchema),
        ProviderModels: jsonSchemaFromZod(getActionDefinition("providers.listModels").outputSchema),
        ProviderVoices: jsonSchemaFromZod(getActionDefinition("providers.listVoices").outputSchema),
        ProviderHealth: jsonSchemaFromZod(getActionDefinition("providers.getHealth").outputSchema),
        Eval: jsonSchemaFromZod(publicEvalSchema),
        EvalList: jsonSchemaFromZod(z.array(publicEvalSchema)),
        SyntheticEvalResult: jsonSchemaFromZod(publicSyntheticEvalResultSchema),
        Methodology: jsonSchemaFromZod(publicMethodologySchema),
        BenchmarkMethodologyList: jsonSchemaFromZod(getActionDefinition("benchmark.listMethodologies").outputSchema),
        BenchmarkMethodology: jsonSchemaFromZod(getActionDefinition("benchmark.inspectMethodology").outputSchema),
        LeaderboardList: jsonSchemaFromZod(getActionDefinition("benchmark.listLeaderboardSnapshots").outputSchema),
        FixtureLeaderboard: jsonSchemaFromZod(getActionDefinition("benchmark.fixtureLeaderboard").outputSchema),
        BenchmarkVerificationRequest: jsonSchemaFromZod(getActionDefinition("benchmark.verifyResultIntegrity").inputSchema, "input"),
        BenchmarkVerificationResult: jsonSchemaFromZod(getActionDefinition("benchmark.verifyResultIntegrity").outputSchema),
        Lab: jsonSchemaFromZod(publicLabSchema),
        Error: jsonSchemaFromZod(publicErrorSchema),
      },
    },
  });
}
