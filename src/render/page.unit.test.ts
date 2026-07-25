import { describe, it, expect } from "vitest";
import { renderPage } from "./page";
import type { StatusView } from "../snapshot";
import { buildRangeSnapshot, type DailyRow, type CheckRow } from "../aggregate";

function makeView(banner: StatusView["banner"] = "ok"): StatusView {
  const now = 1784937600 + 12 * 3600;
  const daily: DailyRow[] = [
    { component: "api", day: "2026-07-25", up: 720, total: 720, degraded: 0, sum_latency_ms: 72000 },
  ];
  const latest = new Map<string, CheckRow>([
    ["api", { component: "api", ts: now - 10, ok: 1, state: "up", latency_ms: 40, status_code: 200, error: null }],
  ]);
  return {
    nowUnix: now,
    ranges: {
      "7d": buildRangeSnapshot("7d", now, daily, latest),
      "30d": buildRangeSnapshot("30d", now, daily, latest),
      "90d": buildRangeSnapshot("90d", now, daily, latest),
    },
    banner,
    incidents: [],
  };
}

describe("renderPage", () => {
  it("renders a full HTML doc with all 5 component labels and 3 range views", () => {
    const html = renderPage(makeView());
    expect(html).toContain("<!doctype html>");
    for (const label of ["API", "REST API", "WebDAV", "S3 API", "SFTP"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-range="7d"');
    expect(html).toContain('data-range="30d"');
    expect(html).toContain('data-range="90d"');
    expect(html).toContain("All systems operational");
  });
  it("reflects the banner level in the banner class and text", () => {
    const html = renderPage(makeView("major"));
    expect(html).toContain('class="banner major"');
    expect(html).toContain("Major outage");
  });
  it("escapes incident titles to prevent HTML injection", () => {
    const view = makeView();
    view.incidents = [{ id: 1, component: "api", kind: "manual", status: "investigating", title: "<script>x</script>", body: "b & c", started_at: view.nowUnix, resolved_at: null, created_at: view.nowUnix, updated_at: view.nowUnix }];
    const html = renderPage(view);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
