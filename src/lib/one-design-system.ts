export const ONE_PRODUCT = {
  name: "ONE Voice Lab",
  parent: "Omni Neural Engine",
  description: "A human-centered interface for exploring, comparing, evaluating, and building with voice systems.",
  independence: "Independent and community-built. Provider integrations do not imply sponsorship or endorsement.",
} as const;

export const ONE_BRAND_COLORS = {
  primary: "#9966CC",
  secondary: "#009966",
  purple: "#9966CC",
  green: "#009966",
} as const;

/**
 * Reserved integration path for the approved Omni Neural Engine mark.
 * The asset is intentionally not bundled until an approved file is supplied.
 */
export const OMNI_WATERMARK_ASSET_PATH =
  "/brand/omni-neural-engine-mark.svg" as const;

export const OMNI_WATERMARK_FILESYSTEM_PATH =
  "/public/brand/omni-neural-engine-mark.svg" as const;

export function clampWatermarkOpacity(opacity: number) {
  if (!Number.isFinite(opacity)) return 0.055;
  return Math.min(0.07, Math.max(0.04, opacity));
}
