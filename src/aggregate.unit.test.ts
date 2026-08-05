import { describe, it, expect } from "vitest";
import {
  barColor,
  barSegments,
  bucketColor,
  currentState,
  buildRangeSnapshot,
  buildIntervalSnapshot,
  deriveBanner,
  type DailyRow,
  type CheckRow,
} from "./aggregate";

describe("barColor", () => {
  it("maps uptime pct to color buckets", () => {
    expect(barColor(null)).toBe("none");
    expect(barColor(100)).toBe("up");
    expect(barColor(99.5)).toBe("up");
    expect(barColor(99.4)).toBe("warn");
    expect(barColor(95)).toBe("warn");
    expect(barColor(94.9)).toBe("down");
  });
});

describe("currentState", () => {
  const now = 1784937600;
  it("returns unknown when no check or stale", () => {
    expect(currentState(undefined, now)).toBe("unknown");
    const stale = { component: "api", ts: now - 400, ok: 1, state: "up", latency_ms: 10, status_code: 200, error: null } as CheckRow;
    expect(currentState(stale, now)).toBe("unknown");
  });
  it("returns the latest state when fresh", () => {
    const fresh = { component: "api", ts: now - 30, ok: 1, state: "up", latency_ms: 10, status_code: 200, error: null } as CheckRow;
    expect(currentState(fresh, now)).toBe("up");
  });
});

describe("buildRangeSnapshot", () => {
  const now = 1784937600 + 12 * 3600; // 2026-07-25T12:00Z
  it("computes per-day bars and window uptime from daily rows", () => {
    const daily: DailyRow[] = [
      { component: "api", day: "2026-07-24", up: 1440, total: 1440, degraded: 0, sum_latency_ms: 144000 },
      { component: "api", day: "2026-07-25", up: 700, total: 720, degraded: 0, sum_latency_ms: 72000 },
    ];
    const latest = new Map<string, CheckRow>([
      ["api", { component: "api", ts: now - 20, ok: 1, state: "up", latency_ms: 42, status_code: 200, error: null }],
    ]);
    const snap = buildRangeSnapshot("7d", now, daily, latest);
    const api = snap.components.find((c) => c.key === "api")!;
    expect(api.bars).toHaveLength(7);
    // last two days have data, earlier five are "none"
    expect(api.bars[6].day).toBe("2026-07-25");
    expect(api.bars[6].color).toBe("warn"); // 700/720 = 97.2%
    expect(api.bars[5].color).toBe("up"); // 100%
    expect(api.bars[0].color).toBe("none");
    // window uptime = (1440+700)/(1440+720)
    expect(api.uptimePct).toBeCloseTo(((1440 + 700) / (1440 + 720)) * 100, 5);
    expect(api.currentState).toBe("up");
    expect(api.latencyMs).toBe(42);
    // components always present in fixed order, even with no data
    expect(snap.components.map((c) => c.key)).toEqual(["web", "docs", "api", "rest", "webdav", "s3", "sftp"]);
    expect(snap.components.find((c) => c.key === "sftp")!.uptimePct).toBeNull();
  });

  it("exposes raw counts on daily bars, deriving down from the rollup", () => {
    const daily: DailyRow[] = [
      { component: "api", day: "2026-07-25", up: 700, total: 720, degraded: 5, sum_latency_ms: 72000 },
    ];
    const snap = buildRangeSnapshot("7d", now, daily, new Map());
    const api = snap.components.find((c) => c.key === "api")!;
    expect(api.bars[6]).toMatchObject({ up: 700, degraded: 5, down: 15, total: 720 });
    // day with no rollup row → zero counts
    expect(api.bars[0]).toMatchObject({ up: 0, degraded: 0, down: 0, total: 0, color: "none" });
  });
});

describe("bucketColor", () => {
  it("uses worst-state priority: down > degraded > up > none", () => {
    expect(bucketColor(0, 0, 0, 0)).toBe("none");
    expect(bucketColor(5, 0, 0, 5)).toBe("up");
    expect(bucketColor(4, 1, 0, 5)).toBe("warn");
    expect(bucketColor(4, 0, 1, 5)).toBe("down");
    expect(bucketColor(3, 1, 1, 5)).toBe("down");
  });
});

describe("buildIntervalSnapshot", () => {
  // Align now to a minute boundary so bucket edges are predictable.
  const now = 1784937600 + 14 * 3600 + 30 * 60; // 2026-07-25T14:30:00Z
  function chk(component: string, ts: number, state: string): CheckRow {
    return { component, ts, ok: state === "up" ? 1 : 0, state, latency_ms: 50, status_code: 200, error: null };
  }

  it("60m: buckets raw checks per minute and computes window uptime", () => {
    // three consecutive minutes for api: up, down, up  → last three buckets
    const checks: CheckRow[] = [
      chk("api", now - 3 * 60 + 1, "up"),
      chk("api", now - 2 * 60 + 1, "down"),
      chk("api", now - 1 * 60 + 1, "up"),
    ];
    const latest = new Map<string, CheckRow>([["api", chk("api", now - 10, "up")]]);
    const snap = buildIntervalSnapshot("60m", now, checks, latest);
    const api = snap.components.find((c) => c.key === "api")!;
    expect(api.bars).toHaveLength(60);
    // window uptime = 2 up / 3 total
    expect(api.uptimePct).toBeCloseTo((2 / 3) * 100, 5);
    // the down minute bar is red
    const colored = api.bars.filter((b) => b.color !== "none").map((b) => b.color);
    expect(colored).toEqual(["up", "down", "up"]);
    // components always present in fixed order
    expect(snap.components.map((c) => c.key)).toEqual(["web", "docs", "api", "rest", "webdav", "s3", "sftp"]);
    expect(snap.components.find((c) => c.key === "sftp")!.uptimePct).toBeNull();
  });

  it("24h: aggregates an hour of checks into one bar with worst-state color", () => {
    const hourStart = Math.floor(now / 3600) * 3600 - 3600; // previous full hour
    const checks: CheckRow[] = [
      chk("s3", hourStart + 60, "up"),
      chk("s3", hourStart + 120, "up"),
      chk("s3", hourStart + 180, "degraded"),
    ];
    const snap = buildIntervalSnapshot("24h", now, checks, new Map());
    const s3 = snap.components.find((c) => c.key === "s3")!;
    expect(s3.bars).toHaveLength(24);
    const nonEmpty = s3.bars.filter((b) => b.color !== "none");
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].color).toBe("warn"); // a degraded sample in the hour
    expect(s3.uptimePct).toBeCloseTo((2 / 3) * 100, 5);
  });

  it("exposes raw counts on interval bars", () => {
    const checks = [
      chk("api", now - 30, "up"),
      chk("api", now - 90, "down"),
      chk("api", now - 150, "up"),
    ];
    const snap = buildIntervalSnapshot("24h", now, checks, new Map());
    const api = snap.components.find((c) => c.key === "api")!;
    const lastBar = api.bars[api.bars.length - 1];
    expect(lastBar).toMatchObject({ up: 2, degraded: 0, down: 1, total: 3 });
  });
});

describe("barSegments", () => {
  it("returns zeros for an empty bucket", () => {
    expect(barSegments(0, 0, 0, 0)).toEqual({ upPct: 0, degradedPct: 0, downPct: 0 });
  });
  it("gives a pure bucket 100% of its single state", () => {
    expect(barSegments(60, 0, 0, 60)).toEqual({ upPct: 100, degradedPct: 0, downPct: 0 });
    expect(barSegments(0, 60, 0, 60)).toEqual({ upPct: 0, degradedPct: 100, downPct: 0 });
    expect(barSegments(0, 0, 60, 60)).toEqual({ upPct: 0, degradedPct: 0, downPct: 100 });
  });
  it("splits proportionally when every non-zero segment is above the floor", () => {
    expect(barSegments(39, 0, 26, 65)).toEqual({ upPct: 60, degradedPct: 0, downPct: 40 });
    expect(barSegments(30, 15, 15, 60)).toEqual({ upPct: 50, degradedPct: 25, downPct: 25 });
  });
  it("floors a tiny down segment at 8% and takes the excess from the largest", () => {
    const s = barSegments(59, 0, 1, 60);
    expect(s.downPct).toBe(8);
    expect(s.upPct).toBe(92);
    expect(s.upPct + s.degradedPct + s.downPct).toBe(100);
  });
  it("floors a tiny up segment too (floor is symmetric)", () => {
    const s = barSegments(1, 0, 59, 60);
    expect(s.upPct).toBe(8);
    expect(s.downPct).toBe(92);
  });
  it("floors two tiny segments at once, largest absorbs both", () => {
    const s = barSegments(1, 1, 58, 60);
    expect(s.upPct).toBe(8);
    expect(s.degradedPct).toBe(8);
    expect(s.downPct).toBe(84);
  });
});

describe("deriveBanner", () => {
  it("prioritizes outages, then degraded, then maintenance, then ok", () => {
    expect(deriveBanner(["up", "up", "up", "up", "up"], false)).toBe("ok");
    expect(deriveBanner(["up", "up", "up", "up", "up"], true)).toBe("maintenance");
    expect(deriveBanner(["up", "degraded", "up", "up", "up"], false)).toBe("degraded");
    expect(deriveBanner(["down", "up", "up", "up", "up"], false)).toBe("partial");
    expect(deriveBanner(["down", "down", "down", "up", "up"], false)).toBe("major");
    expect(deriveBanner(["unknown", "up", "up", "up", "up"], false)).toBe("ok");
  });
});
