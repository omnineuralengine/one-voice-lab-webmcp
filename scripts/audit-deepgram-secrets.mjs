import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["src", "public", ".env.example", ".next/static"].map((path) => join(root, path)).filter(existsSync);
const textExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".html", ".css", ".map"]);
const files = scanRoots.flatMap(walk).filter((path) => textExtensions.has(extname(path)) || path.endsWith(".env.example"));
const failures = [];

const configuredSecrets = [];
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  const localEnvironment = readFileSync(envPath, "utf8");
  for (const name of ["DEEPGRAM_API_KEY", "ELEVENLABS_API_KEY", "FISH_AUDIO_API_KEY", "CARTESIA_API_KEY", "RESON8_API_KEY"]) {
    const match = localEnvironment.match(new RegExp(`^${name}\\s*=\\s*["']?([^\\r\\n"']+)`, "m"));
    const value = match?.[1]?.trim() ?? "";
    if (value.length >= 12) configuredSecrets.push(value);
  }
}

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const name = relative(root, file);
  if (/NEXT_PUBLIC_(?:DEEPGRAM|DG)_?(?:API_?)?KEY/i.test(content)) failures.push(`${name}: public Deepgram key variable name`);
  if (/NEXT_PUBLIC_ELEVENLABS?_?(?:API_?)?KEY/i.test(content)) failures.push(`${name}: public ElevenLabs key variable name`);
  if (/NEXT_PUBLIC_FISH(?:_AUDIO)?_?(?:API_?)?KEY/i.test(content)) failures.push(`${name}: public Fish Audio key variable name`);
  if (/NEXT_PUBLIC_CARTESIA_?(?:API_?)?KEY/i.test(content)) failures.push(`${name}: public Cartesia key variable name`);
  if (/NEXT_PUBLIC_RESON8_?(?:API_?)?KEY/i.test(content)) failures.push(`${name}: public Reson8 key variable name`);
  if (/NEXT_PUBLIC_TWILIO_/i.test(content)) failures.push(`${name}: public Twilio variable name`);
  if (/TWILIO_(?:TEST_)?ACCOUNT_SID\s*[:=]\s*["'`]?AC[0-9a-f]{32}/i.test(content)) failures.push(`${name}: hard-coded Twilio account SID`);
  if (/TWILIO_(?:TEST_)?AUTH_TOKEN\s*[:=]\s*["'`]?[0-9a-f]{32}(?:["'`]|\s|$)/i.test(content)) failures.push(`${name}: hard-coded Twilio auth token`);
  if (configuredSecrets.some((secret) => content.includes(secret))) failures.push(`${name}: configured provider key value`);
  if (/Authorization\s*[:=]\s*["'`]Token\s+(?!\$|\{|<|server|Configured|%)[A-Za-z0-9_-]{16,}/i.test(content)) failures.push(`${name}: hard-coded Token credential`);
}

if (failures.length) {
  console.error(`Provider secret audit failed (${failures.length} finding(s)).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Provider secret audit passed across ${files.length} source and browser-asset files.`);

function walk(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
