import { z } from "zod";

export const VIEWER_EVENT_NAMES = [
  "page_view",
  "provider_profile_open",
  "provider_module_open",
] as const;

export const VIEWER_PROVIDER_IDS = ["deepgram", "fish-audio", "elevenlabs"] as const;

export const VIEWER_SURFACES = [
  "home",
  "providers",
  "provider",
  "simulate",
  "build",
  "learn",
  "settings",
  "other",
] as const;

export const viewerEventInputSchema = z.object({
  eventName: z.enum(VIEWER_EVENT_NAMES),
  surface: z.enum(VIEWER_SURFACES),
  providerId: z.enum(VIEWER_PROVIDER_IDS).optional(),
}).strict().superRefine((value, context) => {
  if (value.eventName !== "page_view" && !value.providerId) {
    context.addIssue({
      code: "custom",
      message: "Provider interactions require a known provider ID.",
      path: ["providerId"],
    });
  }
});

export type ViewerEventInput = z.infer<typeof viewerEventInputSchema>;
export type ViewerEventName = (typeof VIEWER_EVENT_NAMES)[number];
export type ViewerProviderId = (typeof VIEWER_PROVIDER_IDS)[number];
export type ViewerSurface = (typeof VIEWER_SURFACES)[number];

export type ViewerEventRow = Readonly<{
  event_name: ViewerEventInput["eventName"];
  surface: ViewerSurface;
  provider_id: ViewerProviderId | null;
}>;

export function classifyViewerEvent(input: ViewerEventInput): ViewerEventRow {
  return {
    event_name: input.eventName,
    surface: input.surface,
    provider_id: input.providerId ?? null,
  };
}

export function classifyViewerSurface(path: string): ViewerSurface {
  const pathname = normalizeViewerPath(path);
  if (pathname === "/") return "home";
  if (pathname === "/providers" || pathname === "/providers/") return "providers";
  if (pathname.startsWith("/providers/")) return "provider";
  if (pathname.startsWith("/simulation") || pathname.startsWith("/simulations")) return "simulate";
  if (["/build", "/architecture-studio", "/live-solution-studio", "/pre-sales-studio", "/deliverables"]
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "build";
  if (["/learn", "/methodology", "/evals", "/capabilities", "/for-agents"]
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "learn";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  return "other";
}

export function createViewerEventInput(
  eventName: ViewerEventName,
  path: string,
  providerId?: ViewerProviderId,
): ViewerEventInput {
  return {
    eventName,
    surface: classifyViewerSurface(path),
    providerId: providerId ?? providerFromPath(path) ?? undefined,
  };
}

function normalizeViewerPath(path: string) {
  try {
    return new URL(path, "https://one-voice-lab.invalid").pathname;
  } catch {
    return "/invalid";
  }
}

function providerFromPath(path: string): ViewerProviderId | null {
  const match = /^\/providers\/(deepgram|fish-audio|elevenlabs)(?:\/|$)/.exec(normalizeViewerPath(path));
  return (match?.[1] as ViewerProviderId | undefined) ?? null;
}
