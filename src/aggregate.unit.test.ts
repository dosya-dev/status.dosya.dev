import { describe, it, expect } from "vitest";
import {
  barColor,
  currentState,
  buildRangeSnapshot,
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
    expect(snap.components.map((c) => c.key)).toEqual(["api", "rest", "webdav", "s3", "sftp"]);
    expect(snap.components.find((c) => c.key === "sftp")!.uptimePct).toBeNull();
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
