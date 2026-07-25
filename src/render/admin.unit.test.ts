import { describe, it, expect } from "vitest";
import { renderAdmin } from "./admin";

describe("renderAdmin", () => {
  it("returns an HTML form with the incident fields and noindex", () => {
    const html = renderAdmin();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('id="token"');
    expect(html).toContain('id="component"');
    expect(html).toContain('id="kind"');
    expect(html).toContain('id="title"');
    expect(html).toContain("/admin/incidents");
  });
});
