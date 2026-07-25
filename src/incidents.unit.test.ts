import { describe, it, expect } from "vitest";
import { decideAutoTransition } from "./incidents";

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
