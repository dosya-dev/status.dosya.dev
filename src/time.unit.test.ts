import { describe, it, expect } from "vitest";
import { dayKey, lastNDays, RANGE_DAYS, lastNBuckets, labelHHMM, labelHour, INTERVAL_SPEC } from "./time";

describe("dayKey", () => {
  it("formats a UTC YYYY-MM-DD from unix seconds", () => {
    expect(dayKey(0)).toBe("1970-01-01");
    // 2026-07-25T00:00:00Z = 1784937600
    expect(dayKey(1784937600)).toBe("2026-07-25");
  });
});

describe("lastNDays", () => {
  it("returns n day keys oldest-first ending at now's day", () => {
    const now = 1784937600 + 12 * 3600; // 2026-07-25T12:00Z
    expect(lastNDays(now, 3)).toEqual(["2026-07-23", "2026-07-24", "2026-07-25"]);
  });
});

describe("RANGE_DAYS", () => {
  it("maps day ranges to day counts", () => {
    expect(RANGE_DAYS).toEqual({ "7d": 7, "30d": 30, "90d": 90 });
  });
});

describe("labelHHMM / labelHour", () => {
  it("formats UTC time labels", () => {
    const t = 1784937600 + 14 * 3600 + 23 * 60; // 2026-07-25T14:23Z
    expect(labelHHMM(t)).toBe("14:23");
    expect(labelHour(t)).toBe("14:00");
    expect(labelHHMM(1784937600)).toBe("00:00");
  });
});

describe("lastNBuckets", () => {
  it("returns aligned bucket starts oldest-first (minute step)", () => {
    const now = 1784937600 + 14 * 3600 + 23 * 60 + 45; // 14:23:45Z
    const b = lastNBuckets(now, 3, 60);
    // aligned to the minute: 14:21, 14:22, 14:23
    expect(b).toEqual([1784937600 + 14 * 3600 + 21 * 60, 1784937600 + 14 * 3600 + 22 * 60, 1784937600 + 14 * 3600 + 23 * 60]);
  });
  it("aligns to the hour for hour step", () => {
    const now = 1784937600 + 14 * 3600 + 23 * 60; // 14:23Z
    const b = lastNBuckets(now, 2, 3600);
    expect(b).toEqual([1784937600 + 13 * 3600, 1784937600 + 14 * 3600]); // 13:00, 14:00
  });
});

describe("INTERVAL_SPEC", () => {
  it("defines 60m (60x1min) and 24h (24x1h)", () => {
    expect(INTERVAL_SPEC["60m"].count).toBe(60);
    expect(INTERVAL_SPEC["60m"].step).toBe(60);
    expect(INTERVAL_SPEC["24h"].count).toBe(24);
    expect(INTERVAL_SPEC["24h"].step).toBe(3600);
  });
});
