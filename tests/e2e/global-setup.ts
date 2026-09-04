import { request, type FullConfig } from "@playwright/test";

import {
  dynamicPublicRouteHandshakePaths,
  ensureDynamicPublicRoutesDiscovered,
} from "./next-route-readiness";

export default async function globalSetup(config: FullConfig) {
  const configuredBaseUrl = config.projects[0]?.use.baseURL;
  if (typeof configuredBaseUrl !== "string") {
    throw new Error("The main browser suite requires a configured base URL.");
  }

  const baseUrl = new URL(configuredBaseUrl);
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1") {
    throw new Error("Dynamic route readiness is restricted to the loopback E2E server.");
  }

  const context = await request.newContext({ baseURL: baseUrl.origin });
  try {
    return await ensureDynamicPublicRoutesDiscovered(async () => {
      for (const path of dynamicPublicRouteHandshakePaths) {
        const response = await context.fetch(path, { method: "OPTIONS" });
        await response.dispose();
      }
    });
  } finally {
    await context.dispose();
  }
}
