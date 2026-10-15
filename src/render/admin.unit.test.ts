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

it("keeps the admin form a plain block layout despite sharing the page stylesheet", () => {
  const html = renderAdmin();
  expect(html).toContain(".wrap{max-width:640px;display:block}");
  expect(html).toContain('id="starts"');
});
