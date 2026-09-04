import { readFile, stat, utimes } from "node:fs/promises";
import { resolve } from "node:path";

const DYNAMIC_PUBLIC_ROUTES = [
  {
    requestPath: "/api/public/v1/evals/__compiler_readiness__",
    sourcePath: ["evals", "[eval]", "route.ts"],
    manifestKey: "/api/public/v1/evals/[eval]/route",
  },
  {
    requestPath: "/api/public/v1/evals/__compiler_readiness__/run",
    sourcePath: ["evals", "[eval]", "run", "route.ts"],
    manifestKey: "/api/public/v1/evals/[eval]/run/route",
  },
  {
    requestPath: "/api/public/v1/methodologies/__compiler_readiness__",
    sourcePath: ["methodologies", "[methodology]", "route.ts"],
    manifestKey: "/api/public/v1/methodologies/[methodology]/route",
  },
  ...["capabilities", "health", "models", "voices"].map((route) => ({
    requestPath: `/api/public/v1/providers/__compiler_readiness__/${route}`,
    sourcePath: ["providers", "[provider]", route, "route.ts"],
    manifestKey: `/api/public/v1/providers/[provider]/${route}/route`,
  })),
] as const;

const POLL_INTERVAL_MS = 50;
const READINESS_TIMEOUT_MS = 15_000;

function delay(durationMs: number) {
  return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, durationMs));
}

export const dynamicPublicRouteHandshakePaths = DYNAMIC_PUBLIC_ROUTES.map(({ requestPath }) => requestPath);

export async function ensureDynamicPublicRoutesDiscovered(triggerDiscovery: () => Promise<void>) {
  const distDir = process.env.PLAYWRIGHT_DIST_DIR?.trim();
  if (!distDir || !/^\.next-[a-z0-9-]+$/i.test(distDir)) {
    throw new Error("The main E2E dist directory is missing or unsafe.");
  }

  const routeFiles = DYNAMIC_PUBLIC_ROUTES.map(({ sourcePath }) => resolve(
    process.cwd(), "src", "app", "api", "public", "v1", ...sourcePath,
  ));
  const manifestPath = resolve(process.cwd(), distDir, "dev", "server", "app-paths-manifest.json");
  const expectedManifestKeys = DYNAMIC_PUBLIC_ROUTES.map(({ manifestKey }) => manifestKey);
  const originalTimes = await Promise.all(routeFiles.map(async (path) => {
    const metadata = await stat(path);
    return { path, atime: metadata.atime, mtime: metadata.mtime };
  }));
  const restoreOriginalTimes = async () => {
    const results = await Promise.allSettled(
      originalTimes.map(({ path, atime, mtime }) => utimes(path, atime, mtime)),
    );
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  };

  const discovered = async () => {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, string>;
      return expectedManifestKeys.every((key) => key in manifest);
    } catch {
      return false;
    }
  };

  if (await discovered()) return async () => {};

  const readinessTimestamp = new Date();
  try {
    await Promise.all(originalTimes.map(({ path, atime }) => utimes(path, atime, readinessTimestamp)));
    await triggerDiscovery();
  } catch (error) {
    await restoreOriginalTimes();
    throw error;
  }
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (!(await discovered())) {
    if (Date.now() >= deadline) {
      await restoreOriginalTimes();
      throw new Error("Next dev did not publish the complete dynamic public route manifest.");
    }
    await delay(POLL_INTERVAL_MS);
  }

  return restoreOriginalTimes;
}
