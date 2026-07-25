import { describe, it, expect } from "vitest";
import { constantTimeEqual, checkAdminToken } from "./auth";
import type { Env } from "./config";

describe("constantTimeEqual", () => {
  it("is true only for identical strings", () => {
    expect(constantTimeEqual("secret", "secret")).toBe(true);
    expect(constantTimeEqual("secret", "secreu")).toBe(false);
    expect(constantTimeEqual("secret", "secret1")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("checkAdminToken", () => {
  const env = { STATUS_ADMIN_TOKEN: "topsecret" } as unknown as Env;
  it("accepts a correct Bearer token", () => {
    const req = new Request("https://s/admin", { headers: { authorization: "Bearer topsecret" } });
    expect(checkAdminToken(req, env)).toBe(true);
  });
  it("rejects wrong/missing tokens", () => {
    expect(checkAdminToken(new Request("https://s/admin", { headers: { authorization: "Bearer nope" } }), env)).toBe(false);
    expect(checkAdminToken(new Request("https://s/admin"), env)).toBe(false);
  });
  it("rejects everything when no token is configured", () => {
    const noEnv = {} as unknown as Env;
    const req = new Request("https://s/admin", { headers: { authorization: "Bearer anything" } });
    expect(checkAdminToken(req, noEnv)).toBe(false);
  });
});
