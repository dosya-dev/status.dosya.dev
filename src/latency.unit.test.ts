import { describe, it, expect } from "vitest";
import { decideLatencyState, applyLatencyCeilings } from "./latency";
import { LATENCY_CEILING_MS } from "./config";
import type { ProbeResult } from "./probes/http";

/**
 * Read from the constant rather than repeated here, so raising or lowering a
 * ceiling in config.ts cannot silently invert what these cases assert.
 */
const FILES_CEILING = LATENCY_CEILING_MS.files!;

const ten = (ms: number) => Array<number | null>(10).fill(ms);

describe("decideLatencyState", () => {
  it("is up when the median sits under the ceiling", () => {
    expect(decideLatencyState(ten(500), 2000)).toBe("up");
  });
  it("degrades when the median exceeds the ceiling", () => {
    expect(decideLatencyState(ten(5000), 2000)).toBe("degraded");
  });
  it("is up exactly at the ceiling", () => {
    expect(decideLatencyState(ten(2000), 2000)).toBe("up");
  });
  it("ignores a single slow outlier, because it takes the median", () => {
    const samples = [30000, ...Array<number | null>(9).fill(200)];
    expect(decideLatencyState(samples, 2000)).toBe("up");
  });
  it("is up below the minimum sample count, so a cold start cannot trip it", () => {
    expect(decideLatencyState(ten(5000).slice(0, 9), 2000)).toBe("up");
    expect(decideLatencyState([], 2000)).toBe("up");
  });
  it("drops nulls instead of counting them as fast responses", () => {
    // A null is a failed probe, already recorded as down. Counting one as a
    // 0ms response is how a latency ceiling would end up masking an outage,
    // which is the one thing these ceilings must never do.

    // 2 nulls plus 10 real samples. The 10 usable ones clear the minimum on
    // their own, so this verdict rests on the nulls being excluded from the
    // count, not on the count falling short.
    expect(decideLatencyState([null, null, ...Array<number | null>(10).fill(5000)], 2000)).toBe("degraded");

    // Nulls excluded from the MEDIAN too, which is the half a null-as-zero
    // reading would break: 11 nulls plus 10 slow samples. Dropped, the median
    // is 5000 and this degrades. Read as zeroes, the median of 21 samples
    // lands on a 0, and a component failing more probes than it answers would
    // report as comfortably fast.
    const mostlyFailing = [...Array<number | null>(11).fill(null), ...Array<number | null>(10).fill(5000)];
    expect(decideLatencyState(mostlyFailing, 2000)).toBe("degraded");

    // And nulls cannot make up a shortfall in usable samples: 9 real ones is
    // still below the minimum however many nulls sit beside them.
    expect(decideLatencyState([null, null, ...Array<number | null>(9).fill(5000)], 2000)).toBe("up");
  });
});

describe("applyLatencyCeilings", () => {
  const up = (component: string, latency: number): ProbeResult => ({
    component, ok: true, state: "up", latency_ms: latency, status_code: 200, error: null,
  });

  it("downgrades a slow but succeeding component to degraded", () => {
    const slow = FILES_CEILING * 2;
    const out = applyLatencyCeilings([up("files", slow)], new Map([["files", ten(slow)]]));
    expect(out[0].state).toBe("degraded");
    expect(out[0].ok).toBe(false);
    expect(out[0].error).toContain("latency");
  });

  // The other side of I6: the one live measurement of this request during
  // design was 7480ms, and the opening ceiling has to sit above it. A
  // permanently degraded component records 0 of 1440 up in `daily`, which
  // publishes 0 percent uptime for it and feeds the marketing page's average.
  it("leaves the files probe up at the latency actually measured in production", () => {
    const out = applyLatencyCeilings([up("files", 7480)], new Map([["files", ten(7480)]]));
    expect(out[0].state).toBe("up");
  });

  it("never upgrades a down result", () => {
    const down: ProbeResult = {
      component: "files", ok: false, state: "down", latency_ms: null, status_code: 500, error: "HTTP 500",
    };
    const out = applyLatencyCeilings([down], new Map([["files", ten(100)]]));
    expect(out[0].state).toBe("down");
  });

  it("leaves components without a configured ceiling alone", () => {
    const out = applyLatencyCeilings([up("web", 9000)], new Map([["web", ten(9000)]]));
    expect(out[0].state).toBe("up");
  });
});
