import { describe, it, expect } from "vitest";
import { renderPage } from "./page";
import type { StatusView } from "../snapshot";
import { buildRangeSnapshot, buildIntervalSnapshot, type DailyRow, type CheckRow } from "../aggregate";

function makeView(banner: StatusView["banner"] = "ok"): StatusView {
  const now = 1784937600 + 12 * 3600;
  const daily: DailyRow[] = [
    { component: "api", day: "2026-07-25", up: 720, total: 720, degraded: 0, sum_latency_ms: 72000 },
  ];
  const latest = new Map<string, CheckRow>([
    ["api", { component: "api", ts: now - 10, ok: 1, state: "up", latency_ms: 40, status_code: 200, error: null }],
  ]);
  return {
    nowUnix: now,
    ranges: {
      "60m": buildIntervalSnapshot("60m", now, [], latest),
      "24h": buildIntervalSnapshot("24h", now, [], latest),
      "7d": buildRangeSnapshot("7d", now, daily, latest),
      "30d": buildRangeSnapshot("30d", now, daily, latest),
      "90d": buildRangeSnapshot("90d", now, daily, latest),
    },
    banner,
    incidents: [],
  };
}

describe("renderPage", () => {
  it("renders a full HTML doc with all 6 component labels and all 5 range views", () => {
    const html = renderPage(makeView());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('href="/favicon.ico"');
    for (const label of ["Web App", "API", "REST API", "WebDAV", "S3 API", "SFTP"]) {
      expect(html).toContain(label);
    }
    for (const r of ["60m", "24h", "7d", "30d", "90d"]) {
      expect(html).toContain(`data-range="${r}"`);
    }
    expect(html).toContain("60 min");
    expect(html).toContain("24 hours");
    expect(html).toContain("All systems operational");
  });

  it("includes theme + timezone toggles, RSS/fonts, and product/support links", () => {
    const html = renderPage(makeView());
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('id="tz-toggle"');
    expect(html).toContain('rel="alternate" type="application/rss+xml"');
    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("Space+Grotesk");
    expect(html).toContain('href="https://dosya.dev"');
    expect(html).toContain('href="https://dosya.dev/help"');
    expect(html).toContain('href="/rss.xml"');
    // updated timestamp is a re-formattable <time> carrying unix seconds
    expect(html).toContain(`<time class="ts" data-ts="${1784937600 + 12 * 3600}">`);
  });

  it("defaults to the 60m view being active", () => {
    const html = renderPage(makeView());
    expect(html).toContain('class="rangeview active" data-range="60m"');
    // the 90d view exists but is not the active one
    expect(html).toContain('data-range="90d"');
    expect(html).not.toContain('class="rangeview active" data-range="90d"');
  });
  it("reflects the banner level in the banner class and text", () => {
    const html = renderPage(makeView("major"));
    expect(html).toContain('class="banner major"');
    expect(html).toContain("Major outage");
  });
  it("escapes incident titles to prevent HTML injection", () => {
    const view = makeView();
    view.incidents = [{ id: 1, component: "api", kind: "manual", status: "investigating", title: "<script>x</script>", body: "b & c", started_at: view.nowUnix, resolved_at: null, created_at: view.nowUnix, updated_at: view.nowUnix }];
    const html = renderPage(view);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
