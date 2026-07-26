export type DayRangeKey = "7d" | "30d" | "90d";
export type IntervalRangeKey = "60m" | "24h";
export type RangeKey = IntervalRangeKey | DayRangeKey;

export const RANGE_DAYS: Record<DayRangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** UTC 'HH:MM' from unix seconds. */
export function labelHHMM(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** UTC 'HH:00' from unix seconds (hour bucket label). */
export function labelHour(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

/** Interval-view specs: fine-grained ranges bucketed from raw checks (not daily rollups). */
export const INTERVAL_SPEC: Record<
  IntervalRangeKey,
  { count: number; step: number; label: (ts: number) => string; windowSeconds: number }
> = {
  "60m": { count: 60, step: 60, label: labelHHMM, windowSeconds: 60 * 60 },
  "24h": { count: 24, step: 3600, label: labelHour, windowSeconds: 24 * 3600 },
};

/** UTC day key 'YYYY-MM-DD' from unix seconds. */
export function dayKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The last `n` day keys ending at `nowUnix` (oldest first). */
export function lastNDays(nowUnix: number, n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(dayKey(nowUnix - i * 86400));
  }
  return days;
}

/**
 * Bucket start times for an interval view: `count` buckets of `stepSeconds`,
 * aligned to step boundaries, ending at the bucket containing `nowUnix`
 * (oldest first).
 */
export function lastNBuckets(nowUnix: number, count: number, stepSeconds: number): number[] {
  const alignedCurrent = Math.floor(nowUnix / stepSeconds) * stepSeconds;
  const starts: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    starts.push(alignedCurrent - i * stepSeconds);
  }
  return starts;
}
