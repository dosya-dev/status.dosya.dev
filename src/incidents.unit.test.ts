import { describe, it, expect } from "vitest";
import { decideAutoTransition, buildTransition } from "./incidents";

// AUTO_INCIDENT_FAIL_THRESHOLD is 2. States are newest-first.
describe("decideAutoTransition", () => {
  it("opens after 2 consecutive downs when none open", () => {
    expect(decideAutoTransition(["down", "down"], false)).toBe("open");
    expect(decideAutoTransition(["down", "down", "up"], false)).toBe("open");
  });
  it("does not open on a single down", () => {
    expect(decideAutoTransition(["down", "up"], false)).toBe("none");
    expect(decideAutoTransition(["down"], false)).toBe("none");
  });
  it("closes when open and newest is not down", () => {
    expect(decideAutoTransition(["up", "down", "down"], true)).toBe("close");
    expect(decideAutoTransition(["degraded"], true)).toBe("close");
  });
  it("stays open when open and newest is down", () => {
    expect(decideAutoTransition(["down", "down"], true)).toBe("none");
  });
  it("handles empty input", () => {
    expect(decideAutoTransition([], false)).toBe("none");
    expect(decideAutoTransition([], true)).toBe("none");
  });
});

describe("buildTransition", () => {
  it("builds an open transition with the component label and threshold-adjusted start", () => {
    // AUTO_INCIDENT_FAIL_THRESHOLD is 2, so the first failing check was one
    // minute before now.
    expect(buildTransition("files", "open", 1_791_000_120)).toEqual({
      component: "files",
      label: "File Listing",
      action: "open",
      startedAt: 1_791_000_060,
    });
  });

  it("carries the incident's real start time on a close", () => {
    // openedAt supplied: the close uses it, not nowUnix.
    expect(buildTransition("dav", "close", 1_791_000_120, 1_790_999_000)).toEqual({
      component: "dav",
      label: "WebDAV Listing",
      action: "close",
      startedAt: 1_790_999_000,
    });
    // openedAt omitted: falls back to nowUnix.
    expect(buildTransition("dav", "close", 1_791_000_120)).toEqual({
      component: "dav",
      label: "WebDAV Listing",
      action: "close",
      startedAt: 1_791_000_120,
    });
    // open is still backdated by (AUTO_INCIDENT_FAIL_THRESHOLD - 1) * 60, unaffected by the fourth param.
    expect(buildTransition("dav", "open", 1_791_000_120)).toEqual({
      component: "dav",
      label: "WebDAV Listing",
      action: "open",
      startedAt: 1_791_000_060,
    });
  });

  it("falls back to the raw key when a component has no label", () => {
    expect(buildTransition("mystery", "open", 1_791_000_120).label).toBe("mystery");
  });
});
