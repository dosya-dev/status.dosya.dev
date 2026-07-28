import { describe, it, expect } from "vitest";
import { runAllProbes } from "./index";
import type { Env } from "../config";
import type { ComponentDef } from "../config";
import type { ProbeResult } from "./http";

const env = {} as Env;

function result(component: string, state: ProbeResult["state"]): ProbeResult {
  return {
    component,
    ok: state === "up",
    state,
    latency_ms: state === "down" ? null : 20,
    status_code: state === "down" ? null : 200,
    error: state === "down" ? "timeout" : null,
  };
}

describe("runAllProbes retry", () => {
  it("retries a down probe once and records the retry result", async () => {
    const calls = new Map<string, number>();
    const prober = async (c: ComponentDef): Promise<ProbeResult> => {
      const n = (calls.get(c.key) ?? 0) + 1;
      calls.set(c.key, n);
      // api fails on the first attempt, succeeds on the retry
      if (c.key === "api" && n === 1) return result("api", "down");
      return result(c.key, "up");
    };
    const results = await runAllProbes(env, prober);
    const api = results.find((r) => r.component === "api")!;
    expect(api.state).toBe("up");
    expect(calls.get("api")).toBe(2);
    // healthy components are probed exactly once
    expect(calls.get("web")).toBe(1);
    expect(calls.get("sftp")).toBe(1);
  });

  it("records down when the retry also fails (one retry only)", async () => {
    const calls = new Map<string, number>();
    const prober = async (c: ComponentDef): Promise<ProbeResult> => {
      calls.set(c.key, (calls.get(c.key) ?? 0) + 1);
      if (c.key === "api") return result("api", "down");
      return result(c.key, "up");
    };
    const results = await runAllProbes(env, prober);
    const api = results.find((r) => r.component === "api")!;
    expect(api.state).toBe("down");
    expect(calls.get("api")).toBe(2);
  });

  it("does not retry degraded results", async () => {
    const calls = new Map<string, number>();
    const prober = async (c: ComponentDef): Promise<ProbeResult> => {
      calls.set(c.key, (calls.get(c.key) ?? 0) + 1);
      if (c.key === "api") return result("api", "degraded");
      return result(c.key, "up");
    };
    const results = await runAllProbes(env, prober);
    expect(results.find((r) => r.component === "api")!.state).toBe("degraded");
    expect(calls.get("api")).toBe(1);
  });

  it("returns one result per component in component order", async () => {
    const prober = async (c: ComponentDef): Promise<ProbeResult> => result(c.key, "up");
    const results = await runAllProbes(env, prober);
    expect(results.map((r) => r.component)).toEqual(["web", "api", "rest", "webdav", "s3", "sftp"]);
  });
});
