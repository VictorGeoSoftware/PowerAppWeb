import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

function pngSize(path: string) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const publicDir = join(__dirname, "..", "..", "public");

describe("manifest", () => {
  const m = manifest();

  it("declares the PowerApp standalone app", () => {
    expect(m).toMatchObject({
      id: "/",
      name: "PowerApp",
      short_name: "PowerApp",
      lang: "es",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#F8FAFC",
      theme_color: "#F8FAFC",
    });
  });

  it("has any 192/512 and maskable 512 icons that exist with the declared size", () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const icon of icons) {
      const [w, h] = String(icon.sizes).split("x").map(Number);
      expect(pngSize(join(publicDir, icon.src))).toEqual({ width: w, height: h });
    }
  });

  it("has a 180px apple-touch-icon", () => {
    expect(pngSize(join(publicDir, "icons/apple-touch-icon.png"))).toEqual({ width: 180, height: 180 });
  });
});
