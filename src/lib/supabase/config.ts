import { z } from "zod";

const publicSupabaseConfigSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(20).max(1_024),
}).strict();

const viewerAnalyticsSupabaseConfigSchema = publicSupabaseConfigSchema;

export type OneOAuthProvider = "google" | "github" | "apple" | "azure";

const walletConnectProjectIdSchema = z.string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const ONE_OAUTH_PROVIDERS: ReadonlyArray<{ id: OneOAuthProvider; label: string; enabled: boolean }> = [
  { id: "google", label: "Google", enabled: process.env.NEXT_PUBLIC_ONE_AUTH_GOOGLE_ENABLED === "true" },
  { id: "github", label: "GitHub", enabled: process.env.NEXT_PUBLIC_ONE_AUTH_GITHUB_ENABLED === "true" },
  { id: "apple", label: "Apple", enabled: process.env.NEXT_PUBLIC_ONE_AUTH_APPLE_ENABLED === "true" },
  { id: "azure", label: "Microsoft", enabled: process.env.NEXT_PUBLIC_ONE_AUTH_MICROSOFT_ENABLED === "true" },
];

export function getPublicSupabaseConfig() {
  const result = publicSupabaseConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}

export function getViewerAnalyticsSupabaseConfig() {
  const result = viewerAnalyticsSupabaseConfigSchema.safeParse({
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}

export function isOneWeb3Enabled() {
  return process.env.NEXT_PUBLIC_ONE_AUTH_WEB3_ENABLED === "true";
}

export function getOneWalletConnectProjectId() {
  const result = walletConnectProjectIdSchema.safeParse(process.env.NEXT_PUBLIC_ONE_WALLETCONNECT_PROJECT_ID);
  return result.success ? result.data : null;
}

export function isOneWalletConnectEnabled() {
  return isOneWeb3Enabled()
    && process.env.NEXT_PUBLIC_ONE_AUTH_WALLETCONNECT_ENABLED === "true"
    && getOneWalletConnectProjectId() !== null;
}
