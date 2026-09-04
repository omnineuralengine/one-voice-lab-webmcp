import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "100.97.142.108"],
  // Keep visual-regression baselines scoped to product UI. Next still reports
  // compile and runtime errors when its route-status badge is hidden.
  devIndicators: process.env.PLAYWRIGHT_E2E === "1" ? false : undefined,
  distDir:
    process.env.PLAYWRIGHT_DIST_DIR?.trim() ||
    (process.env.PLAYWRIGHT_E2E === "1" ? ".next-e2e" : ".next"),
  outputFileTracingIncludes: {    "/api/deliverables/generate": ["./public/brand/one-voice-lab-logo.png"],
  },

  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
