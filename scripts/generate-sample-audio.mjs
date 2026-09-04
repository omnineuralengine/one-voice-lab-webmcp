import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const scenariosPath = path.join(rootDir, "src", "lib", "sample-scenarios.json");
const outputDir = path.join(rootDir, "public", "samples");
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

const scenarios = JSON.parse(await readFile(scenariosPath, "utf8"));
const plannedSamples = scenarios.map((scenario) => {
  const filePath = path.join(outputDir, `${scenario.slug}.mp3`);

  return {
    ...scenario,
    filePath,
    relativePath: path.relative(rootDir, filePath),
    charCount: scenario.transcript.length,
    exists: existsSync(filePath),
  };
});

const queuedSamples = plannedSamples.filter((sample) => force || !sample.exists);
const totalCharacters = queuedSamples.reduce((sum, sample) => sum + sample.charCount, 0);

console.log("Deepgram sample audio generation plan");
console.log(`Output directory: ${path.relative(rootDir, outputDir)}`);
console.log(`Mode: ${force ? "force overwrite existing files" : "skip existing files"}`);
console.log("");

for (const sample of plannedSamples) {
  const status = sample.exists && !force ? "skip existing" : "generate";
  console.log(`- ${sample.relativePath} (${sample.charCount} chars, ${sample.voiceModel}, ${status})`);
}

console.log("");
console.log(`Queued files: ${queuedSamples.length}`);
console.log(`Total queued TTS characters: ${totalCharacters}`);

if (!queuedSamples.length) {
  console.log("Nothing to generate. Use npm run samples:generate -- --force to overwrite existing files.");
  process.exit(0);
}

if (dryRun) {
  console.log("Dry run complete. No Deepgram request was made.");
  process.exit(0);
}

const apiKey = process.env.DEEPGRAM_API_KEY || (await readEnvLocalValue("DEEPGRAM_API_KEY"));

if (!apiKey) {
  console.error("DEEPGRAM_API_KEY was not found in process.env or .env.local.");
  process.exit(1);
}

const confirmed = await askForConfirmation(
  `This will consume Deepgram TTS credits for ${totalCharacters} characters. Type "generate" to continue: `,
);

if (!confirmed) {
  console.log("Canceled. No audio files were generated.");
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });

let successCount = 0;
let failureCount = 0;

for (const sample of queuedSamples) {
  try {
    await generateSample(sample, apiKey);
    successCount += 1;
    console.log(`Generated ${sample.relativePath}`);
  } catch (error) {
    failureCount += 1;
    console.error(`Failed ${sample.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("");
console.log(`Done. Generated ${successCount} file(s), ${failureCount} failure(s).`);

async function generateSample(sample, apiKey) {
  const endpoint = new URL("https://api.deepgram.com/v1/speak");
  endpoint.searchParams.set("model", sample.voiceModel);
  endpoint.searchParams.set("encoding", "mp3");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: sample.transcript }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${details ? `: ${details.slice(0, 400)}` : ""}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(sample.filePath, audio);
}

async function readEnvLocalValue(name) {
  const envPath = path.join(rootDir, ".env.local");

  if (!existsSync(envPath)) {
    return "";
  }

  const envText = await readFile(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match || match[1] !== name) {
      continue;
    }

    return stripEnvQuotes(match[2].trim());
  }

  return "";
}

function stripEnvQuotes(value) {
  const first = value.at(0);
  const last = value.at(-1);

  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

async function askForConfirmation(question) {
  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === "generate";
  } finally {
    rl.close();
  }
}
