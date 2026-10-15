import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// The social preview is served as a Workers static asset, not by the fetch
// handler, so the only thing that can break it is the file or the config
// going missing. This pins both.
describe("social preview asset", () => {
  it("ships a 1200x630 PNG at public/social-preview.png", () => {
    const png = readFileSync(path.join(root, "public", "social-preview.png"));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // IHDR: width and height are big-endian u32 at offsets 16 and 20
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("serves public/ as static assets in wrangler.jsonc", () => {
    const cfg = readFileSync(path.join(root, "wrangler.jsonc"), "utf8");
    expect(cfg).toMatch(/"assets"\s*:\s*\{[^}]*"directory"\s*:\s*"\.\/public"/);
  });
});
