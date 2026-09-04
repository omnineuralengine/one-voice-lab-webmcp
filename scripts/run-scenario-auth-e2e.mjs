import { execFileSync, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const command = isWindows ? (process.env.ComSpec || "cmd.exe") : "npx";
const npxArguments = (args) => isWindows ? ["/d", "/s", "/c", "npx", ...args] : args;
let statusText;
try {
  statusText = execFileSync(command, npxArguments(["supabase", "status", "-o", "env"]), {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  console.error("The disposable local Supabase stack is not available. Start and reset the repository-local stack before running this test.");
  process.exit(1);
}

const localEnvironment = Object.fromEntries(
  statusText
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const apiUrl = localEnvironment.API_URL;
const publishableKey = localEnvironment.ANON_KEY;
const serviceRoleKey = localEnvironment.SERVICE_ROLE_KEY;
const fixtureEmail = "ovl05a-local-auth@example.test";
const fixtureEmailB = "ovl05b-local-auth-b@example.test";
const fixturePassword = "Ovl05a-local-only-password!";
let parsedUrl;
try {
  parsedUrl = new URL(apiUrl);
} catch {
  console.error("The local Supabase status did not provide a valid API URL.");
  process.exit(1);
}
if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname) || parsedUrl.port !== "54321") {
  console.error("Refusing authenticated scenario verification outside the repository-local loopback Supabase API on port 54321.");
  process.exit(1);
}
if (typeof publishableKey !== "string" || publishableKey.length < 20) {
  console.error("The local Supabase status did not provide a usable browser publishable key.");
  process.exit(1);
}
if (typeof serviceRoleKey !== "string" || serviceRoleKey.length < 20) {
  console.error("The local Supabase status did not provide the disposable stack's administrative test key.");
  process.exit(1);
}

await recreateLocalAuthFixture({
  apiOrigin: parsedUrl.origin,
  serviceRoleKey,
  email: fixtureEmail,
  password: fixturePassword,
});
await recreateLocalAuthFixture({
  apiOrigin: parsedUrl.origin,
  serviceRoleKey,
  email: fixtureEmailB,
  password: fixturePassword,
});

const result = spawnSync(
  command,
  npxArguments(["playwright", "test", "--config", "playwright.scenario-auth.config.ts"]),
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: parsedUrl.origin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      LAB_USAGE_GUARD_TOKEN: "",
      DEEPGRAM_API_KEY: "ovl05a-sentinel-must-never-be-used",
      ELEVENLABS_API_KEY: "ovl05a-sentinel-must-never-be-used",
      FISH_AUDIO_API_KEY: "ovl05a-sentinel-must-never-be-used",
      CARTESIA_API_KEY: "ovl05a-sentinel-must-never-be-used",
      RESON8_API_KEY: "ovl05a-sentinel-must-never-be-used",
      ONE_LIVE_LAB_ENABLED: "false",
      ONE_LIVE_EVALS_ENABLED: "false",
      ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
    },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);

async function recreateLocalAuthFixture({ apiOrigin, serviceRoleKey, email, password }) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const listResponse = await fetch(`${apiOrigin}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!listResponse.ok) throw new Error("Unable to prepare the repository-local authenticated test fixture.");
  const listed = await listResponse.json();
  const existing = Array.isArray(listed?.users)
    ? listed.users.find((candidate) => candidate?.email === email)
    : undefined;
  if (typeof existing?.id === "string") {
    const deleteResponse = await fetch(`${apiOrigin}/auth/v1/admin/users/${encodeURIComponent(existing.id)}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!deleteResponse.ok) throw new Error("Unable to reset the repository-local authenticated test fixture.");
  }
  const createResponse = await fetch(`${apiOrigin}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!createResponse.ok) throw new Error("Unable to create the repository-local authenticated test fixture.");
}
