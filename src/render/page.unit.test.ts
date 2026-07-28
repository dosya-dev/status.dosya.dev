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

describe("stacked bars", () => {
  const now = 1784937600 + 14 * 3600 + 30 * 60; // 14:30Z — checks land in the 14:00 bucket
  function chk(ts: number, state: string): CheckRow {
    return { component: "api", ts, ok: state === "up" ? 1 : 0, state, latency_ms: 50, status_code: 200, error: null };
  }
  function htmlWith(checks: CheckRow[]): string {
    const view = makeView();
    view.ranges["24h"] = buildIntervalSnapshot("24h", now, checks, new Map());
    return renderPage(view);
  }

  it("renders a mixed bucket as a hard-stop gradient with data attributes", () => {
    const html = htmlWith([chk(now - 30, "up"), chk(now - 90, "up"), chk(now - 150, "up"), chk(now - 210, "down"), chk(now - 270, "down")]);
    expect(html).toContain("background:linear-gradient(to top, var(--up) 0% 60%, var(--down) 60% 100%)");
    expect(html).toContain('data-label="14:00"');
    expect(html).toContain('data-up="3"');
    expect(html).toContain('data-down="2"');
    expect(html).toContain('data-total="5"');
    expect(html).toContain('data-pct="60.00%"');
    expect(html).toContain("14:00 — 60.00% success · 3/5 up, 2 down");
  });

  it("renders a degraded middle band between up and down", () => {
    const html = htmlWith([chk(now - 30, "up"), chk(now - 90, "up"), chk(now - 150, "degraded"), chk(now - 210, "down")]);
    expect(html).toContain("background:linear-gradient(to top, var(--up) 0% 50%, var(--warn) 50% 75%, var(--down) 75% 100%)");
    expect(html).toContain("14:00 — 50.00% success · 2/4 up, 1 degraded, 1 down");
  });

  it("keeps pure buckets as solid class-based bars (no inline style)", () => {
    const html = htmlWith([chk(now - 30, "up"), chk(now - 90, "up")]);
    expect(html).toContain('<div class="b up" data-label="14:00"');
    expect(html).not.toContain('class="b mix" data-label="14:00"');
  });

  it("applies the 8% visibility floor to blip segments", () => {
    const checks: CheckRow[] = [];
    for (let i = 0; i < 59; i++) checks.push(chk(now - 30 - i, "up"));
    checks.push(chk(now - 300, "down"));
    const html = htmlWith(checks);
    expect(html).toContain("background:linear-gradient(to top, var(--up) 0% 92%, var(--down) 92% 100%)");
  });

  it("renders no-data buckets as plain gray bars without data attributes", () => {
    const html = htmlWith([]);
    expect(html).toContain('<div class="b"></div>');
  });
});

describe("bar popover", () => {
  it("ships the shared popover shell and client logic", () => {
    const html = renderPage(makeView());
    expect(html).toContain('<div id="bar-pop" hidden></div>');
    expect(html).toContain("#bar-pop"); // styles
    expect(html).toContain("data-total]"); // JS selector for bars
    expect(html).toContain("removeAttribute('title')"); // no-JS fallback strip
  });
});

