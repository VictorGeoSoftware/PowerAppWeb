// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Parity with ../BmApp/app/src/main/java/com/briel/marnisos/brielapp/ui/theme/Color.kt
const light: Record<string, string> = {
  primary: "#FACC15",
  "primary-foreground": "#0F172A",
  secondary: "#1F2937",
  "secondary-foreground": "#F8FAFC",
  background: "#F8FAFC",
  foreground: "#0F172A",
  card: "#FFFFFF",
  muted: "#F1F5F9",
  "muted-foreground": "#64748B",
  input: "#CBD5E1",
  border: "#E2E8F0",
  tertiary: "#F59E0B",
  "table-header": "#5DADE2",
  "table-header-foreground": "#FFFFFF",
  "table-border": "#222222",
  "table-text": "#495057",
  "table-text-secondary": "#6C757D",
  "header-highlight": "#F3D34A",
  "header-background": "#FFFFFF",
  "section-highlight": "#D0E7FF",
  "section-border": "#222222",
  "best-option": "#DCFCE7",
  "best-option-foreground": "#166534",
  "delta-negative": "#D32F2F",
  "delta-positive": "#000000",
};
const dark: Record<string, string> = {
  primary: "#FACC15",
  "primary-foreground": "#0F172A",
  secondary: "#E2E8F0",
  "secondary-foreground": "#020617",
  background: "#020617",
  foreground: "#E2E8F0",
  card: "#0B1220",
  muted: "#0F172A",
  "muted-foreground": "#94A3B8",
  input: "#334155",
  border: "#1F2937",
  tertiary: "#FCD34D",
  "table-header": "#1E40AF",
  "table-header-foreground": "#E2E8F0",
  "table-border": "#64748B",
  "table-text": "#E2E8F0",
  "table-text-secondary": "#CBD5E1",
  "header-highlight": "#B45309",
  "header-background": "#1E293B",
  "section-highlight": "#1D4ED8",
  "section-border": "#64748B",
};

const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");
// lastIndexOf: the @custom-variant line also contains this media query.
const darkStart = css.lastIndexOf("@media (prefers-color-scheme: dark)");
const lightBlock = css.slice(css.indexOf(":root {"), darkStart);
const darkBlock = css.slice(darkStart, css.indexOf("@layer base"));

const valueOf = (block: string, name: string) =>
  block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim().toUpperCase();

describe("theme tokens match BmApp", () => {
  it.each(Object.entries(light))("light --%s = %s", (name, hex) => {
    expect(valueOf(lightBlock, name)).toBe(hex);
  });
  it.each(Object.entries(dark))("dark --%s = %s", (name, hex) => {
    expect(valueOf(darkBlock, name)).toBe(hex);
  });
  it("dark mode follows the system preference", () => {
    expect(css).toContain("@custom-variant dark (@media (prefers-color-scheme: dark))");
  });
});
