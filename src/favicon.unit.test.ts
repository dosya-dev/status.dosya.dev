import { describe, it, expect } from "vitest";
import { FAVICON_SVG, faviconIcoBytes } from "./favicon";

describe("favicon assets", () => {
  it("exposes a valid SVG string", () => {
    expect(FAVICON_SVG.startsWith("<?xml") || FAVICON_SVG.startsWith("<svg")).toBe(true);
    expect(FAVICON_SVG).toContain("<svg");
  });
  it("decodes the .ico into bytes with the ICO magic header", () => {
    const bytes = faviconIcoBytes();
    expect(bytes.length).toBeGreaterThan(0);
    // ICO header: 00 00 01 00 (reserved=0, type=1 icon)
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0, 0, 1, 0]);
  });
});
