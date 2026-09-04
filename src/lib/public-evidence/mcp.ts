import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";

import { getActionDefinition, type ActionInput } from "@/lib/actions/registry";
import type { ActionError } from "@/lib/actions/contracts";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function actionErrorResult(error: ActionError) {
  const value = { ok: false as const, error };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function createVoiceLabMcpServer(): McpServer {
  const server = new McpServer({
    name: "open-voice-ai-lab",
    version: "1.0.0",
  });

  server.registerTool(
    "voice_lab.list_providers",
    {
      title: "List voice lab providers",
      description: "List evidence-labeled provider registry records. This read-only tool cannot execute provider operations.",
      inputSchema: getActionDefinition("providers.list").inputSchema,
    },
    async (input) => {
      await recordPublicUsage("mcp_list");
      const actionResult = await executePublicServerAction("providers.list", input, { source: "mcp" });
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.get_provider",
    {
      title: "Get a voice lab provider",
      description: "Get one public provider record by the stable ID returned by voice_lab.list_providers.",
      inputSchema: getActionDefinition("providers.get").inputSchema,
    },
    async ({ providerId }) => {
      await recordPublicUsage("mcp_get");
      const actionResult = await executePublicServerAction(
        "providers.get",
        { providerId } as ActionInput<"providers.get">,
        { source: "mcp" },
      );
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.list_provider_capabilities",
    {
      title: "List provider capabilities",
      description: "List normalized capability declarations with verification and provenance. This never invokes the provider.",
      inputSchema: getActionDefinition("providers.listCapabilities").inputSchema,
    },
    async ({ providerId }) => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("providers.listCapabilities", { providerId }, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.list_provider_models",
    {
      title: "List provider models",
      description: "List curated or cache-backed public model metadata. No live discovery request is made.",
      inputSchema: getActionDefinition("providers.listModels").inputSchema,
    },
    async ({ providerId }) => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("providers.listModels", { providerId }, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.list_provider_voices",
    {
      title: "List public provider voices",
      description: "List curated public-safe voice metadata only. Account-scoped provider voice catalogs are never exposed.",
      inputSchema: getActionDefinition("providers.listVoices").inputSchema,
    },
    async ({ providerId }) => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("providers.listVoices", { providerId }, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.get_provider_health",
    {
      title: "Get provider readiness",
      description: "Read local or cached readiness/health state separately from benchmark performance. No paid health check is made.",
      inputSchema: getActionDefinition("providers.getHealth").inputSchema,
    },
    async ({ providerId }) => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("providers.getHealth", { providerId }, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.list_evals",
    {
      title: "List voice lab evaluations",
      description: "List reproducible public evaluation definitions, fixture hashes, and limitations.",
      inputSchema: getActionDefinition("evaluations.list").inputSchema,
    },
    async () => {
      await recordPublicUsage("mcp_list");
      const actionResult = await executePublicServerAction("evaluations.list", {}, { source: "mcp" });
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.get_eval",
    {
      title: "Get a voice lab evaluation",
      description: "Get one public evaluation definition by its stable ID.",
      inputSchema: getActionDefinition("evaluations.get").inputSchema,
    },
    async ({ evalId }) => {
      await recordPublicUsage("mcp_get");
      const actionResult = await executePublicServerAction("evaluations.get", { evalId }, { source: "mcp" });
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.get_methodology",
    {
      title: "Get evaluation methodology",
      description: "Get the lab's evidence vocabulary, comparison principles, limitations, and safety constraints.",
      inputSchema: getActionDefinition("methodology.get").inputSchema,
    },
    async () => {
      await recordPublicUsage("mcp_get");
      const actionResult = await executePublicServerAction("methodology.get", {}, { source: "mcp" });
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.compare_providers",
    {
      title: "Compare provider registry evidence",
      description: "Compare listed integration and evidence states without producing a provider quality ranking.",
      inputSchema: getActionDefinition("providers.compareEvidence").inputSchema,
    },
    async ({ providerIds }) => {
      await recordPublicUsage("mcp_compare");
      const actionResult = await executePublicServerAction(
        "providers.compareEvidence",
        { providerIds } as ActionInput<"providers.compareEvidence">,
        { source: "mcp" },
      );
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.run_synthetic_eval",
    {
      title: "Run a deterministic synthetic evaluation",
      description: "Run an existing repository-owned local fixture. This accepts no content or remote URL and makes no provider call.",
      inputSchema: getActionDefinition("publicEvaluation.runSynthetic").inputSchema,
    },
    async ({ evalId }) => {
      await recordPublicUsage("mcp_synthetic_eval");
      const actionResult = await executePublicServerAction("publicEvaluation.runSynthetic", { evalId }, { source: "mcp" });
      return actionResult.ok ? toolResult(actionResult.data) : actionErrorResult(actionResult.error);
    },
  );

  server.registerTool(
    "voice_lab.list_benchmark_methodologies",
    {
      title: "List benchmark methodologies",
      description: "List the versioned canonical ONE benchmark methodology contracts.",
      inputSchema: getActionDefinition("benchmark.listMethodologies").inputSchema,
    },
    async () => {
      await recordPublicUsage("mcp_list");
      const result = await executePublicServerAction("benchmark.listMethodologies", {}, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.get_benchmark_methodology",
    {
      title: "Get benchmark methodology",
      description: "Get one exact canonical benchmark methodology ID and version.",
      inputSchema: getActionDefinition("benchmark.inspectMethodology").inputSchema,
    },
    async (input) => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("benchmark.inspectMethodology", input, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.list_leaderboards",
    {
      title: "List verified leaderboard snapshots",
      description: "List a bounded page of public-verified Stage 3 snapshot metadata. Empty means no published snapshots are available.",
      inputSchema: getActionDefinition("benchmark.listLeaderboardSnapshots").inputSchema,
    },
    async (input) => {
      await recordPublicUsage("mcp_list");
      const result = await executePublicServerAction("benchmark.listLeaderboardSnapshots", input, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.get_fixture_leaderboard",
    {
      title: "Get synthetic fixture leaderboard",
      description: "Return ONE's deterministic non-public fixture snapshot. It is simulated and makes no provider-performance claim.",
      inputSchema: getActionDefinition("benchmark.fixtureLeaderboard").inputSchema,
    },
    async () => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("benchmark.fixtureLeaderboard", {}, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  server.registerTool(
    "voice_lab.verify_benchmark_result",
    {
      title: "Verify benchmark result integrity",
      description: "Recompute the canonical Stage 3 SHA-256 integrity status for a supplied result. No provider or signing key is used.",
      inputSchema: getActionDefinition("benchmark.verifyResultIntegrity").inputSchema,
    },
    async (input) => {
      await recordPublicUsage("mcp_get");
      const result = await executePublicServerAction("benchmark.verifyResultIntegrity", input, { source: "mcp" });
      return result.ok ? toolResult(result.data) : actionErrorResult(result.error);
    },
  );

  return server;
}

export const voiceLabMcpHandler = createMcpHandler(
  () => createVoiceLabMcpServer(),
  { responseMode: "json" },
);
