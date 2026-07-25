import { describe, it, expect } from "vitest";
import { dayKey, lastNDays, RANGE_DAYS } from "./time";

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
  it("maps ranges to day counts", () => {
    expect(RANGE_DAYS).toEqual({ "7d": 7, "30d": 30, "90d": 90 });
  });
});
