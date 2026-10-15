import { describe, it, expect } from "vitest";
import { decideAlerts, type Transition } from "./alerts";

const opts = { maintenanceActive: false, statusUrl: "https://status.dosya.dev" };
const t = (over: Partial<Transition> = {}): Transition => ({
  component: "files",
  label: "File Listing",
  action: "open",
  startedAt: 1_791_000_000,
  ...over,
});

describe("decideAlerts", () => {
  it("emits one down alert for an opened incident", () => {
    const out = decideAlerts([t()], opts);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("down");
    expect(out[0].component).toBe("files");
    expect(out[0].subject).toContain("File Listing");
    expect(out[0].text).toContain("https://status.dosya.dev");
  });

  it("emits a recovered alert for a closed incident", () => {
    const out = decideAlerts([t({ action: "close" })], opts);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("recovered");
  });

  it("fingerprints by component so one outage is one Sentry issue", () => {
    const [a] = decideAlerts([t()], opts);
    const [b] = decideAlerts([t({ startedAt: 1_791_000_060 })], opts);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toBe("status:files");
  });

  // Review Focus 5
  it("suppresses every alert while maintenance is active", () => {
    const out = decideAlerts([t(), t({ action: "close", component: "dav" })], {
      ...opts,
      maintenanceActive: true,
    });
    expect(out).toEqual([]);
  });

  // Review Focus 3: only transitions reach this function, so a flap that
  // produced no transition produces no alert.
  it("emits nothing for an empty transition list", () => {
    expect(decideAlerts([], opts)).toEqual([]);
  });

  it("emits one alert per component when several fail at once", () => {
    const out = decideAlerts([t(), t({ component: "dav", label: "WebDAV Listing" })], opts);
    expect(out.map((a) => a.component)).toEqual(["files", "dav"]);
  });
});
