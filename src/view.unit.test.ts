import { describe, it, expect } from "vitest";
import { COMPONENT_ORDER, PRODUCT_GROUPS } from "./config";
import { buildRangeSnapshot, buildIntervalSnapshot, type DailyRow, type CheckRow, type IncidentRow } from "./aggregate";
import {
  buildGroups,
  buildLatencySeries,
  clusterIncidents,
  groupEntriesByMonth,
  splitIncidents,
  formatDuration,
  countEntriesSince,
} from "./view";

const now = 1784937600 + 12 * 3600; // 2026-07-25T12:00Z

function chk(component: string, ts: number, state: string, latency: number | null = 50): CheckRow {
  return { component, ts, ok: state === "up" ? 1 : 0, state, latency_ms: latency, status_code: 200, error: null };
}

function fresh(component: string, state: string, latency: number | null): [string, CheckRow] {
  return [component, chk(component, now - 10, state, latency)];
}

describe("PRODUCT_GROUPS", () => {
  it("places every probe key in exactly one product", () => {
    const seen: string[] = [];
    for (const g of PRODUCT_GROUPS) for (const p of g.products) for (const c of p.checks) seen.push(c.key);
    expect([...seen].sort()).toEqual([...COMPONENT_ORDER].sort());
  });
  it("describes every product in plain words", () => {
    for (const g of PRODUCT_GROUPS) for (const p of g.products) expect(p.description.length).toBeGreaterThan(20);
  });
});

describe("buildGroups", () => {
  const daily: DailyRow[] = [
    { component: "rest", day: "2026-07-24", up: 1440, total: 1440, degraded: 0, sum_latency_ms: 0 },
    { component: "rest", day: "2026-07-25", up: 720, total: 720, degraded: 0, sum_latency_ms: 0 },
    // the listing probe only started today and had one failed check
    { component: "files", day: "2026-07-25", up: 719, total: 720, degraded: 0, sum_latency_ms: 0 },
    { component: "web", day: "2026-07-25", up: 700, total: 720, degraded: 0, sum_latency_ms: 0 },
  ];
  const latest = new Map<string, CheckRow>([
    fresh("rest", "up", 35),
    fresh("files", "degraded", 423),
    fresh("web", "up", 46),
  ]);
  const snap = buildRangeSnapshot("7d", now, daily, latest);
  const groups = buildGroups(snap, {});

  it("returns the three surfaces in order with their products", () => {
    expect(groups.map((g) => g.label)).toEqual(["Web", "API", "Protocols"]);
    expect(groups[1].products.map((p) => p.label)).toEqual(["API", "REST API"]);
  });

  it("merges a product's checks into one bar strip, bucket by bucket", () => {
    const rest = groups[1].products.find((p) => p.label === "REST API")!;
    expect(rest.bars).toHaveLength(7);
    const today = rest.bars[6];
    expect(today.total).toBe(1440);
    expect(today.up).toBe(1439);
    expect(today.down).toBe(1);
    expect(today.color).toBe("up"); // 99.93% stays green in a day view
    expect(rest.bars[5].total).toBe(1440); // routing only, yesterday
    expect(rest.bars[0].total).toBe(0);
  });

  it("computes product uptime across all its checks and the worst current state", () => {
    const rest = groups[1].products.find((p) => p.label === "REST API")!;
    expect(rest.uptimePct).toBeCloseTo(((1440 + 720 + 719) / (1440 + 720 + 720)) * 100, 5);
    expect(rest.state).toBe("degraded");
  });

  it("shows the latency of the check a user actually feels (the last configured one)", () => {
    const rest = groups[1].products.find((p) => p.label === "REST API")!;
    expect(rest.latencyMs).toBe(423);
    expect(rest.latencyCheckLabel).toBe("File listing");
  });

  it("records when a check started reporting if it is younger than the window", () => {
    const rest = groups[1].products.find((p) => p.label === "REST API")!;
    const listing = rest.checks.find((c) => c.key === "files")!;
    expect(listing.sinceDay).toBe("2026-07-25");
    const routing = rest.checks.find((c) => c.key === "rest")!;
    expect(routing.sinceDay).toBeNull(); // the oldest check in the product is the baseline
  });

  it("rolls product uptime up to the group", () => {
    const web = groups[0];
    expect(web.uptimePct).toBeCloseTo((700 / 720) * 100, 5);
    const protocols = groups[2];
    expect(protocols.uptimePct).toBeNull();
  });

  it("treats an unconfigured check as absent rather than as an outage", () => {
    const api = groups[1].products.find((p) => p.label === "API")!;
    expect(api.state).toBe("unknown");
    const web = groups[0].products[0];
    expect(web.state).toBe("up");
  });

  it("uses worst-state colouring for interval buckets", () => {
    // `now` is exactly 12:00:00, so checks 30 s earlier land in the 11:59 bucket (index 58).
    const checks = [chk("rest", now - 30, "up"), chk("files", now - 40, "down")];
    const isnap = buildIntervalSnapshot("60m", now, checks, new Map());
    const g = buildGroups(isnap, {});
    const rest = g[1].products.find((p) => p.label === "REST API")!;
    expect(rest.bars[58].color).toBe("down");
    expect(rest.bars[58].uptimePct).toBe(50);
  });

  it("attaches the felt check's latency series to the product", () => {
    const g = buildGroups(snap, { files: [400, 410, null], rest: [30, 31, 32] });
    const rest = g[1].products.find((p) => p.label === "REST API")!;
    expect(rest.latencySeries).toEqual([400, 410, null]);
  });
});

describe("buildLatencySeries", () => {
  it("averages successful checks into 24 hourly buckets, oldest first", () => {
    const h = 3600;
    const t = now + 1800; // 12:30Z, so the newest bucket is [12:00, 13:00) and the oldest [13:00, 14:00) yesterday
    const checks = [
      chk("web", t - 23 * h - 10, "up", 40), // 13:29:50 yesterday, oldest bucket
      chk("web", t - 30, "up", 60),
      chk("web", t - 90, "up", 80),
      chk("web", t - 150, "down", 10000), // a timeout must not drag the average
      chk("web", t - 24 * h - 10, "up", 999), // just outside the window
      chk("sftp", t - 30, "up", 14),
    ];
    const series = buildLatencySeries(t, checks);
    expect(series.web).toHaveLength(24);
    expect(series.web[0]).toBe(40);
    expect(series.web[23]).toBe(70);
    expect(series.web[12]).toBeNull();
    expect(series.sftp[23]).toBe(14);
    expect(series.api).toBeUndefined();
  });
});

function inc(id: number, component: string, started: number, resolved: number | null, extra: Partial<IncidentRow> = {}): IncidentRow {
  return {
    id,
    component,
    kind: "auto",
    status: resolved === null ? "ongoing" : "resolved",
    title: `${component} is down`,
    body: null,
    started_at: started,
    resolved_at: resolved,
    created_at: started,
    updated_at: resolved ?? started,
    ...extra,
  };
}

describe("clusterIncidents", () => {
  it("merges automatic incidents that opened and closed together into one entry", () => {
    const t = now - 86400;
    const rows = [
      inc(4, "webdav", t + 1, t + 600),
      inc(3, "api", t + 1, t + 600),
      inc(2, "docs", t, t + 600),
      inc(1, "web", t, t + 601),
      inc(0, "sftp", t - 7200, t - 7000), // unrelated, earlier
    ];
    const entries = clusterIncidents(rows);
    expect(entries).toHaveLength(2);
    expect(entries[0].ids).toEqual([4, 3, 2, 1]);
    expect(entries[0].affected).toEqual(["Web App", "Document Editor", "API", "WebDAV"]);
    expect(entries[0].title).toBe("Web App, Document Editor, API and WebDAV unreachable");
    expect(entries[0].durationSeconds).toBe(601);
    expect(entries[1].affected).toEqual(["SFTP"]);
    expect(entries[1].title).toBe("SFTP unreachable");
  });

  it("never merges incidents that only share a start time but not an end", () => {
    const t = now - 86400;
    const entries = clusterIncidents([inc(2, "api", t, t + 120), inc(1, "sftp", t, t + 7200)]);
    expect(entries).toHaveLength(2);
  });

  it("keeps manual incidents and maintenance separate and verbatim", () => {
    const t = now - 3600;
    const rows = [
      inc(2, "global", t, null, { kind: "manual", status: "identified", title: "Uploads failing in EU", body: "Fix rolling out." }),
      inc(1, "api", t, null),
    ];
    const entries = clusterIncidents(rows);
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("Uploads failing in EU");
    expect(entries[0].affected).toEqual(["All services"]);
    expect(entries[0].ongoing).toBe(true);
    expect(entries[1].title).toBe("API unreachable");
  });

  it("uses the last update time when an incident was resolved without a resolved_at", () => {
    // addIncidentUpdate with status "resolved" sets incidents.status but not resolved_at
    const t = now - 7200;
    const row = inc(1, "api", t, null, { status: "resolved", updated_at: t + 900 });
    const [entry] = clusterIncidents([row]);
    expect(entry.ongoing).toBe(false);
    expect(entry.resolvedAt).toBe(t + 900);
    expect(entry.durationSeconds).toBe(900);
  });

  it("maps listing probes to the product the customer knows", () => {
    const entries = clusterIncidents([inc(1, "s3auth", now - 600, now - 300)]);
    expect(entries[0].affected).toEqual(["S3 API"]);
  });
});

describe("splitIncidents", () => {
  const t = now - 3600;
  const rows = [
    inc(5, "sftp", t, null),
    inc(4, "global", now + 86400, null, { kind: "maintenance", status: "scheduled", title: "SFTP origin upgrade" }),
    inc(3, "global", now - 86400 * 3, now - 86400 * 3 + 3600, { kind: "maintenance", status: "completed", title: "Database upgrade" }),
    inc(2, "api", now - 86400 * 2, now - 86400 * 2 + 120),
  ];
  const parts = splitIncidents(clusterIncidents(rows), now);
  it("separates the live incident, the upcoming maintenance and the history", () => {
    expect(parts.active.map((e) => e.ids[0])).toEqual([5]);
    expect(parts.maintenance.map((e) => e.ids[0])).toEqual([4]);
    // newest first, and a window scheduled for tomorrow is not history yet
    expect(parts.history.map((e) => e.ids[0])).toEqual([5, 2, 3]);
  });
  it("keeps completed maintenance in the history, not the notice", () => {
    expect(parts.maintenance.find((e) => e.ids[0] === 3)).toBeUndefined();
  });
});

describe("groupEntriesByMonth", () => {
  it("buckets entries by UTC month, newest first, with a readable label", () => {
    const sep = Date.UTC(2026, 8, 27, 14, 49) / 1000;
    const aug = Date.UTC(2026, 7, 27, 12, 12) / 1000;
    const entries = clusterIncidents([inc(2, "sftp", sep, sep + 300), inc(1, "api", aug, aug + 36300)]);
    const months = groupEntriesByMonth(entries);
    expect(months.map((m) => m.label)).toEqual(["September 2026", "August 2026"]);
    expect(months[1].entries[0].ids).toEqual([1]);
  });
});

describe("formatDuration", () => {
  it("reads like a human wrote it", () => {
    expect(formatDuration(30)).toBe("under a minute");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(36300)).toBe("10 h 5 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(78360)).toBe("21 h 46 min");
    expect(formatDuration(2 * 86400 + 3 * 3600)).toBe("2 d 3 h");
  });
});

describe("countEntriesSince", () => {
  it("does not count maintenance windows as incidents", () => {
    const t = now - 3600;
    const entries = clusterIncidents([
      inc(2, "sftp", t, t + 60, { kind: "maintenance", status: "completed", title: "Upgrade" }),
      inc(1, "api", t, t + 60),
    ]);
    expect(countEntriesSince(entries, now - 86400)).toBe(1);
  });

  it("counts clustered entries that started inside the window", () => {
    const t = now - 86400;
    const entries = clusterIncidents([inc(3, "api", t, t + 60), inc(2, "web", t, t + 60), inc(1, "sftp", now - 40 * 86400, now - 40 * 86400 + 60)]);
    expect(countEntriesSince(entries, now - 30 * 86400)).toBe(1);
    expect(countEntriesSince(entries, now - 90 * 86400)).toBe(2);
  });
});
