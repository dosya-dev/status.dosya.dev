export type RangeKey = "7d" | "30d" | "90d";
export const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

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
