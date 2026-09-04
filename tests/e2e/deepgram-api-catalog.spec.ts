import { expect, test } from "@playwright/test";

import { buildGeneratedRequest, generateApiCodeSnippets } from "@/components/api-studio/PayloadBuilder";
import { DEEPGRAM_API_CATALOG } from "@/lib/deepgram-api-catalog";

function operation(id: string) {
  const match = DEEPGRAM_API_CATALOG
    .flatMap((category) => category.operations)
    .find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing catalog operation: ${id}`);
  return match;
}

test.describe("Deepgram API catalog accuracy", () => {
  test("Voice Agent settings identify Deepgram listen and speak providers", () => {
    const settings = operation("voice-agent-converse").parameters.find((parameter) => parameter.name === "settings");
    expect(settings).toBeDefined();

    const payload = JSON.parse(String(settings?.defaultValue)) as {
      agent: {
        language: string;
        listen: { provider: { type: string; model: string } };
        speak: { provider: { type: string; model: string } };
      };
    };

    expect(payload.agent.language).toBe("en");
    expect(payload.agent.listen.provider).toMatchObject({ type: "deepgram", model: "nova-3" });
    expect(payload.agent.speak.provider).toMatchObject({ type: "deepgram", model: "aura-2-asteria-en" });
  });

  test("containerized Live Mic does not suggest raw audio parameters", () => {
    const live = operation("stt-live");
    const parameterNames = live.parameters.map((parameter) => parameter.name);

    expect(parameterNames).not.toContain("encoding");
    expect(parameterNames).not.toContain("sample_rate");
    expect(live.learningNotes.join(" ")).toContain("MediaRecorder container audio");
  });

  test("streaming diarization does not offer prerecorded-only v2", () => {
    const diarization = operation("stt-live").parameters.find((parameter) => parameter.name === "diarize_model");
    expect(diarization?.options?.map((option) => option.value)).toEqual(["none", "latest", "v1"]);
  });

  test("direct TTS snippets handle binary audio instead of parsing JSON", () => {
    const tts = operation("tts-single");
    const values = Object.fromEntries(tts.parameters.map((parameter) => [parameter.name, parameter.defaultValue]));
    const snippets = generateApiCodeSnippets(tts, buildGeneratedRequest(tts, values, null));

    expect(snippets.curl).toContain('--output "speech.bin"');
    expect(snippets.Python).toContain("write_bytes(response.content)");
    expect(snippets.Python).not.toContain("response.json()");
    expect(snippets.TypeScript).toContain("response.arrayBuffer()");
    expect(snippets.Go).toContain("io.Copy(out, resp.Body)");
    expect(snippets[".NET"]).toContain("ReadAsByteArrayAsync()");
  });
});
