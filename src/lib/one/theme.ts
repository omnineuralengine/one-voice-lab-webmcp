import { z } from "zod";

import { ONE_BRAND_COLORS } from "@/lib/one-design-system";

export const ONE_GUEST_THEME_STORAGE_KEY = "one:guest:theme:v1";

const normalizedHexSchema = z.string().regex(/^#[0-9A-F]{6}$/, "Use a six-digit color such as #9966CC.");

export const oneThemePreferencesSchema = z.object({
  primaryHex: normalizedHexSchema,
  secondaryHex: normalizedHexSchema,
  appearance: z.enum(["dark", "light", "system"]),
  reducedMotion: z.boolean(),
}).strict();

export type OneThemePreferences = z.infer<typeof oneThemePreferencesSchema>;

export const DEFAULT_ONE_THEME: OneThemePreferences = Object.freeze({
  primaryHex: ONE_BRAND_COLORS.primary,
  secondaryHex: ONE_BRAND_COLORS.secondary,
  appearance: "dark",
  reducedMotion: false,
});

export function normalizeOneHex(value: string) {
  const normalized = value.trim().toUpperCase();
  return normalizedHexSchema.safeParse(normalized);
}

export function parseStoredOneTheme(value: string | null): OneThemePreferences | null {
  if (!value || value.length > 1_024) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const result = oneThemePreferencesSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function hexToRgb(hex: string) {
  const safeHex = normalizedHexSchema.parse(hex);
  return [
    Number.parseInt(safeHex.slice(1, 3), 16),
    Number.parseInt(safeHex.slice(3, 5), 16),
    Number.parseInt(safeHex.slice(5, 7), 16),
  ] as const;
}

export function contrastRatio(first: string, second: string) {
  const luminance = (hex: string) => {
    const rgb = hexToRgb(hex).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readableForeground(background: string) {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#05070B") ? "#FFFFFF" : "#05070B";
}

export function hasUsablePairContrast(theme: OneThemePreferences) {
  return contrastRatio(theme.primaryHex, theme.secondaryHex) >= 2;
}
