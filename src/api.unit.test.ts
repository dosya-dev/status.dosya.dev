import { describe, it, expect } from "vitest";
import { buildStatusJson, buildUptimeJson, UPTIME_SLA_TARGET } from "./api";
import type { StatusView } from "./snapshot";
import { buildRangeSnapshot, buildIntervalSnapshot, type DailyRow, type CheckRow } from "./aggregate";

function makeView(): StatusView {
  const now = 1784937600 + 12 * 3600;
  const daily: DailyRow[] = [
    { component: "api", day: "2026-07-25", up: 700, total: 720, degraded: 0, sum_latency_ms: 72000 },
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
    banner: "ok",
    incidents: [],
  };
}

describe("buildStatusJson", () => {
  it("emits banner, ranges keyed 60m/24h/7d/30d/90d, and per-component uptime", () => {
    const json = buildStatusJson(makeView()) as any;
    expect(json.banner).toBe("ok");
    expect(Object.keys(json.ranges)).toEqual(["60m", "24h", "7d", "30d", "90d"]);
    expect(json.ranges["7d"].components[0].key).toBe("web");
    expect(json.generatedAt).toBe(1784937600 + 12 * 3600);
  });
});

describe("buildUptimeJson", () => {
  it("emits the SLA target, measured avg uptime, and a status URL", () => {
    const json = buildUptimeJson(makeView(), "https://status.dosya.dev") as any;
    expect(json.slaTarget).toBe(UPTIME_SLA_TARGET);
    expect(json.windowDays).toBe(90);
    expect(json.statusUrl).toBe("https://status.dosya.dev");
    // only the api component has data (700/720) → overall 90d avg = that ratio
    expect(json.avgUptimePct).toBeCloseTo((700 / 720) * 100, 2);
    expect(json.generatedAt).toBe(1784937600 + 12 * 3600);
  });
});
