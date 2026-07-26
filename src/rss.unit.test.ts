import { describe, it, expect } from "vitest";
import { buildRss } from "./rss";
import type { IncidentRow } from "./aggregate";

function inc(over: Partial<IncidentRow>): IncidentRow {
  return {
    id: 1,
    component: "sftp",
    kind: "manual",
    status: "investigating",
    title: "Elevated errors",
    body: null,
    started_at: 1784937600,
    resolved_at: null,
    created_at: 1784937600,
    updated_at: 1784937600,
    ...over,
  };
}

describe("buildRss", () => {
  it("produces a valid RSS 2.0 channel with one item per incident", () => {
    const xml = buildRss([inc({ id: 7, title: "SFTP down" })], 1784937600, "https://status.dosya.dev");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<title>dosya.dev status</title>");
    expect(xml).toContain("[SFTP] SFTP down");
    expect(xml).toContain('<guid isPermaLink="false">incident-7</guid>');
    expect(xml).toContain("<pubDate>");
  });

  it("labels global incidents and escapes XML in titles/bodies", () => {
    const xml = buildRss(
      [inc({ component: "global", title: "A & B <x>", body: 'say "hi"' })],
      1784937600,
      "https://status.dosya.dev",
    );
    expect(xml).toContain("[All systems] A &amp; B &lt;x&gt;");
    expect(xml).toContain("say &quot;hi&quot;");
    expect(xml).not.toContain("<x>");
  });

  it("shows Resolved state when resolved_at is set", () => {
    const xml = buildRss([inc({ resolved_at: 1784941200, status: "resolved" })], 1784941200, "https://s");
    expect(xml).toContain("Status: Resolved");
  });
});
