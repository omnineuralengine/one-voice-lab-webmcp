import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ModulePageShell } from "../../src/components/one/ModulePrimitives";
import { OmniWatermark } from "../../src/components/one/OmniWatermark";
import {
  clampWatermarkOpacity,
  OMNI_WATERMARK_ASSET_PATH,
  OMNI_WATERMARK_FILESYSTEM_PATH,
  ONE_BRAND_COLORS,
} from "../../src/lib/one-design-system";

test.describe("ONE design system", () => {
  test("preserves the approved brand seeds and watermark integration path", () => {
    expect(ONE_BRAND_COLORS).toMatchObject({ primary: "#9966CC", secondary: "#009966", purple: "#9966CC", green: "#009966" });
    expect(OMNI_WATERMARK_ASSET_PATH).toBe("/brand/omni-neural-engine-mark.svg");
    expect(OMNI_WATERMARK_FILESYSTEM_PATH).toBe("/public/brand/omni-neural-engine-mark.svg");
  });

  test("keeps watermark opacity inside the restrained range", () => {
    expect(clampWatermarkOpacity(0.01)).toBe(0.04);
    expect(clampWatermarkOpacity(0.055)).toBe(0.055);
    expect(clampWatermarkOpacity(0.5)).toBe(0.07);
    expect(clampWatermarkOpacity(Number.NaN)).toBe(0.055);
  });

  test("keeps the watermark disabled by default and decorative when enabled", () => {
    expect(OmniWatermark({})).toBeNull();

    const enabled = OmniWatermark({ enabled: true, opacity: 0.5 }) as unknown as {
      props: { "aria-hidden": string; className: string; style: { opacity: number } };
    };
    expect(enabled.props["aria-hidden"]).toBe("true");
    expect(enabled.props.className).toContain("pointer-events-none");
    expect(enabled.props.style.opacity).toBe(0.07);
  });

  test("provides a semantic shell without requiring a client component", () => {
    const shell = ModulePageShell({
      children: "Workspace",
      id: "module-shell",
    }) as unknown as {
      type: string;
      props: { className: string; id: string; children: unknown[] };
    };
    expect(shell.type).toBe("main");
    expect(shell.props.className).toContain("one-module-shell");
    expect(shell.props.id).toBe("module-shell");
    expect(JSON.stringify(shell.props.children)).toContain("Workspace");
    expect(JSON.stringify(shell)).not.toContain("omni-neural-engine-mark.svg");

    const embedded = ModulePageShell({ as: "section", children: "Embedded workspace" }) as unknown as { type: string };
    expect(embedded.type).toBe("section");
  });

  test("ships all required primitives and accessible responsive styles", () => {
    const primitives = source("src/components/one/ModulePrimitives.tsx");
    const watermark = source("src/components/one/OmniWatermark.tsx");
    const css = source("src/app/globals.css");

    for (const component of [
      "ModulePageShell",
      "ModuleHero",
      "ModuleStatusStrip",
      "ModuleWorkspace",
      "ModulePanel",
      "LiveConnectionBadge",
      "InspectorDock",
      "EmptyState",
    ]) {
      expect(primitives).toContain(`export function ${component}`);
    }

    expect(css).toContain("--one-primary: #9966CC");
    expect(css).toContain("--one-secondary: #009966");
    expect(css).toContain("--one-purple: var(--one-primary)");
    expect(css).toContain("--one-green: var(--one-secondary)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("outline: 3px solid var(--one-focus)");
    expect(css).toContain("@media (max-width: 47.99rem)");
    expect(watermark).toContain("pointer-events-none");
    expect(watermark).toContain('aria-hidden="true"');
  });
});

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}
