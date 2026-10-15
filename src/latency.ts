import { LATENCY_CEILING_MS, type ComponentKey } from "./config";
import type { ProbeResult } from "./probes/http";

/** Below this many usable samples, latency is not judged at all. */
export const MIN_LATENCY_SAMPLES = 10;

/**
 * Pure: is this component slow enough to call degraded?
 *
 * The median, not the mean, so one cold start or one 30s outlier cannot move
 * the verdict. Nulls are dropped: a null latency is a failed probe, already
 * counted as down, and treating it as a fast response would mask a real
 * slowdown.
 */
export function decideLatencyState(
  samplesNewestFirst: Array<number | null>,
  ceilingMs: number,
  minSamples: number = MIN_LATENCY_SAMPLES,
): "up" | "degraded" {
  const usable = samplesNewestFirst.filter((s): s is number => typeof s === "number");
  if (usable.length < minSamples) return "up";
  const sorted = [...usable].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return median > ceilingMs ? "degraded" : "up";
}

/**
 * Downgrade succeeding-but-slow results to degraded. Only ever downgrades: a
 * down result stays down.
 */
export function applyLatencyCeilings(
  results: ProbeResult[],
  history: Map<string, Array<number | null>>,
): ProbeResult[] {
  return results.map((r) => {
    if (r.state !== "up") return r;
    const ceiling = LATENCY_CEILING_MS[r.component as ComponentKey];
    if (ceiling === undefined) return r;
    const samples = [r.latency_ms, ...(history.get(r.component) ?? [])];
    if (decideLatencyState(samples, ceiling) === "up") return r;
    return {
      ...r,
      ok: false,
      state: "degraded",
      error: `median latency over ${ceiling}ms`,
    };
  });
}
