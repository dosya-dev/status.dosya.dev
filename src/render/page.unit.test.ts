import { describe, it, expect } from "vitest";
import { renderPage } from "./page";
import type { StatusView } from "../snapshot";
import {
  buildRangeSnapshot,
  buildIntervalSnapshot,
  type DailyRow,
  type CheckRow,
  type IncidentRow,
  type IncidentUpdateRow,
} from "../aggregate";

const NOW = 1784937600 + 12 * 3600; // 2026-07-25T12:00Z

function makeView(banner: StatusView["banner"] = "ok", daily?: DailyRow[]): StatusView {
  const now = NOW;
  const rows: DailyRow[] = daily ?? [
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
      "7d": buildRangeSnapshot("7d", now, rows, latest),
      "30d": buildRangeSnapshot("30d", now, rows, latest),
      "90d": buildRangeSnapshot("90d", now, rows, latest),
    },
    banner,
    incidents: [],
    latency: {},
    updates: [],
  };
}

function incident(partial: Partial<IncidentRow> & { id: number }): IncidentRow {
  return {
    component: "api",
    kind: "auto",
    status: "resolved",
    title: "API is down",
    body: null,
    started_at: NOW - 3600,
    resolved_at: NOW - 3300,
    created_at: NOW - 3600,
    updated_at: NOW - 3300,
    ...partial,
  };
}

describe("renderPage: shell", () => {
  it("renders a full HTML doc with every product label and all 5 range views", () => {
    const html = renderPage(makeView());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('href="/favicon.ico"');
    for (const label of ["Web App", "Document Editor", "API", "REST API", "WebDAV", "S3 API", "SFTP"]) {
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
    expect(html).toContain('href="/api/status"');
    expect(html).toContain(`<time class="ts" data-ts="${NOW}">`);
  });

  it("defaults to the 90 day view, the one a buyer wants to see", () => {
    const html = renderPage(makeView());
    expect(html).toContain('class="rangeview active" data-range="90d"');
    expect(html).not.toContain('class="rangeview active" data-range="60m"');
    expect(html).toContain('data-r="90d" class="active"');
  });

  it("no longer carries the how-we-measure section", () => {
    const html = renderPage(makeView());
    expect(html).not.toContain("How we measure");
    expect(html).not.toContain('class="how"');
  });

  it("describes itself to link unfurlers with a social preview image", () => {
    const html = renderPage(makeView());
    expect(html).toContain('<meta property="og:title" content="dosya.dev status" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:url" content="https://status.dosya.dev/" />');
    expect(html).toContain('<meta property="og:image" content="https://status.dosya.dev/social-preview.png" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta property="og:image:alt" content="dosya.dev live service status: uptime, incidents and updates" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:image" content="https://status.dosya.dev/social-preview.png" />');
    expect(html).toContain('<meta property="og:description" content="');
    expect(html).toContain('<link rel="canonical" href="https://status.dosya.dev/" />');
  });
});

describe("renderPage: hero", () => {
  it("carries the overall state as a class and headline", () => {
    expect(renderPage(makeView())).toContain('class="hero ok"');
    const major = renderPage(makeView("major"));
    expect(major).toContain('class="hero major"');
    expect(major).toContain("Major outage");
  });

  it("shows headline uptime tiles for 24 hours, 30 days and 90 days", () => {
    const html = renderPage(makeView());
    expect(html).toContain("Uptime, 24 hours");
    expect(html).toContain("Uptime, 30 days");
    expect(html).toContain("Uptime, 90 days");
    expect(html).toContain('<div class="tval">100.00%</div>');
    // the interval windows have no checks in this fixture
    expect(html).toContain('<div class="tval none">no data</div>');
  });

  it("says when nothing has reported yet instead of claiming 0 checks passed", () => {
    const view = makeView("ok", []);
    for (const r of Object.values(view.ranges)) for (const c of r.components) c.currentState = "unknown";
    const html = renderPage(view);
    expect(html).toContain("No checks have reported yet.");
    expect(html).not.toContain("All 0 checks");
  });

  it("counts clustered incidents per tile window", () => {
    const view = makeView();
    const t = NOW - 5 * 86400;
    view.incidents = [
      incident({ id: 3, component: "api", started_at: t, resolved_at: t + 60 }),
      incident({ id: 2, component: "web", started_at: t, resolved_at: t + 60 }),
      incident({ id: 1, component: "sftp", started_at: NOW - 60 * 86400, resolved_at: NOW - 60 * 86400 + 60 }),
    ];
    const html = renderPage(view);
    expect(html).toContain('<div class="tsub">1 incident</div>');
    expect(html).toContain('<div class="tsub">2 incidents</div>');
    expect(html).toContain('<div class="tsub">no incidents</div>');
  });
});

describe("renderPage: groups", () => {
  it("groups products under Web, API and Protocols with a group uptime", () => {
    const html = renderPage(makeView());
    expect(html).toContain('<span class="gname">Web</span>');
    expect(html).toContain('<span class="gname">API</span>');
    expect(html).toContain('<span class="gname">Protocols</span>');
    expect(html).toContain('<div class="mono gpct">100.00%<span>90 days</span></div>');
  });

  it("describes each product in customer language, not probe internals", () => {
    const html = renderPage(makeView());
    expect(html).toContain("Connects to the SFTP service and confirms it accepts sessions.");
    for (const jargon of ["app shell", "OPTIONS on", "PROPFIND", "SigV4", "server banner", "GET /health", "TCP connection"]) {
      expect(html).not.toContain(jargon);
    }
  });

  it("renders a check pill per probe for multi-check products, with a since note for younger checks", () => {
    const daily: DailyRow[] = [
      { component: "rest", day: "2026-07-24", up: 1440, total: 1440, degraded: 0, sum_latency_ms: 0 },
      { component: "rest", day: "2026-07-25", up: 720, total: 720, degraded: 0, sum_latency_ms: 0 },
      { component: "files", day: "2026-07-25", up: 720, total: 720, degraded: 0, sum_latency_ms: 0 },
    ];
    const html = renderPage(makeView("ok", daily));
    expect(html).toContain("Routing · 100.00%");
    expect(html).toContain("File listing · 100.00%");
    expect(html).toContain("since Jul 25");
  });

  it("renders a latency sparkline only when there is a trend to show", () => {
    const view = makeView();
    expect(renderPage(view)).not.toContain('class="spark"');
    view.latency = { api: [40, 42, null, 38, 44] };
    const html = renderPage(view);
    expect(html).toContain('<svg class="spark"');
    expect(html).toContain("<polyline");
    expect(html).toContain("40 ms");
  });

  it("formats slow latencies in seconds", () => {
    const view = makeView();
    view.ranges["90d"].components.find((c) => c.key === "api")!.latencyMs = 1675;
    expect(renderPage(view)).toContain("1.7 s");
  });

  it("says when a down product has nothing to measure", () => {
    const view = makeView("partial");
    const api = view.ranges["90d"].components.find((c) => c.key === "api")!;
    api.currentState = "down";
    api.latencyMs = null;
    expect(renderPage(view)).toContain('<div class="mono ms">no response</div>');
  });
});

describe("renderPage: incidents", () => {
  it("shows a live incident card with its status, affected products and updates", () => {
    const view = makeView("partial");
    view.incidents = [
      incident({ id: 9, component: "global", kind: "manual", status: "identified", title: "Uploads failing", body: "Fix rolling out.", resolved_at: null }),
    ];
    const updates: IncidentUpdateRow[] = [
      { id: 1, incident_id: 9, status: "investigating", body: "Looking into it.", created_at: NOW - 3000 },
      { id: 2, incident_id: 9, status: "identified", body: "Cause found.", created_at: NOW - 600 },
    ];
    view.updates = updates;
    const html = renderPage(view);
    expect(html).toContain('<section class="live-incident"');
    expect(html).toContain("Uploads failing");
    expect(html).toContain('<span class="badge no">Identified</span>');
    expect(html).toContain("All services");
    expect(html).toContain("Cause found.");
    expect(html).toContain("Looking into it.");
    expect(html.indexOf("Cause found.")).toBeLessThan(html.indexOf("Looking into it.")); // newest first
    expect(html).toContain(`<time class="ts" data-ts="${NOW - 600}">`);
  });

  it("announces upcoming maintenance in a notice and keeps it out of the history", () => {
    const view = makeView();
    view.incidents = [
      incident({ id: 4, component: "sftp", kind: "maintenance", status: "scheduled", title: "SFTP origin upgrade", started_at: NOW + 86400, resolved_at: null }),
    ];
    const html = renderPage(view);
    expect(html).toContain('<section class="maint"');
    expect(html.split("SFTP origin upgrade").length - 1).toBe(1);
    expect(html).toContain('class="hero ok"');
  });

  it("renders history grouped by month with durations and a resolved badge", () => {
    const view = makeView();
    view.incidents = [
      incident({ id: 2, component: "sftp", started_at: NOW - 3600, resolved_at: NOW - 3300 }),
      incident({ id: 1, component: "api", started_at: NOW - 40 * 86400, resolved_at: NOW - 40 * 86400 + 36300 }),
    ];
    const html = renderPage(view);
    expect(html).toContain('<div class="mname">July 2026</div>');
    expect(html).toContain('<div class="mname">June 2026</div>');
    expect(html).toContain("SFTP unreachable");
    expect(html).toContain("API unreachable");
    expect(html).toContain('<span class="badge yes">Resolved</span>');
    expect(html).toContain("5 min");
    expect(html).toContain("10 h 5 min");
  });

  it("says so when there were no incidents", () => {
    expect(renderPage(makeView())).toContain("No incidents in the last 90 days");
  });

  it("escapes incident titles and bodies to prevent HTML injection", () => {
    const view = makeView();
    view.incidents = [incident({ id: 1, kind: "manual", status: "investigating", title: "<script>x</script>", body: "b & c", resolved_at: null })];
    const html = renderPage(view);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("b &amp; c");
  });
});

describe("stacked bars", () => {
  const now = 1784937600 + 14 * 3600 + 30 * 60; // 14:30Z - checks land in the 14:00 bucket
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
    expect(html).toContain("14:00 - 60.00% success · 3/5 up, 2 down");
  });

  it("renders a degraded middle band between up and down", () => {
    const html = htmlWith([chk(now - 30, "up"), chk(now - 90, "up"), chk(now - 150, "degraded"), chk(now - 210, "down")]);
    expect(html).toContain("background:linear-gradient(to top, var(--up) 0% 50%, var(--warn) 50% 75%, var(--down) 75% 100%)");
    expect(html).toContain("14:00 - 50.00% success · 2/4 up, 1 degraded, 1 down");
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
