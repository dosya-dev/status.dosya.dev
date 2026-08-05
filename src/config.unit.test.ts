import { describe, it, expect } from "vitest";
import { resolveComponents, COMPONENT_ORDER, type Env } from "./config";

const baseEnv = {} as unknown as Env;

describe("resolveComponents", () => {
  it("returns the 7 components in fixed order with defaults", () => {
    const comps = resolveComponents(baseEnv);
    expect(comps.map((c) => c.key)).toEqual(["web", "docs", "api", "rest", "webdav", "s3", "sftp"]);
    expect(COMPONENT_ORDER).toEqual(["web", "docs", "api", "rest", "webdav", "s3", "sftp"]);
    const web = comps.find((c) => c.key === "web")!;
    expect(web.url).toBe("https://app.dosya.dev/login");
    const docs = comps.find((c) => c.key === "docs")!;
    expect(docs.url).toBe("https://docs.dosya.dev/healthcheck");
    const api = comps.find((c) => c.key === "api")!;
    expect(api.url).toBe("https://api.dosya.dev/health");
    const rest = comps.find((c) => c.key === "rest")!;
    expect(rest.url).toBe("https://api.dosya.dev/api/me/name");
    const webdav = comps.find((c) => c.key === "webdav")!;
    expect(webdav.method).toBe("OPTIONS");
    const sftp = comps.find((c) => c.key === "sftp")!;
    expect(sftp.host).toBe("sftp.dosya.dev");
    expect(sftp.port).toBe(22);
  });

  it("honors env overrides and strips trailing slash on API_BASE", () => {
    const env = { API_BASE: "https://api.example.com/", WEB_PROBE_URL: "https://app.example.com/login", DOCS_PROBE_URL: "https://docs.example.com/healthcheck", SFTP_PROBE_HOST: "sftp.example.com", SFTP_PROBE_PORT: "2222" } as unknown as Env;
    const comps = resolveComponents(env);
    expect(comps.find((c) => c.key === "web")!.url).toBe("https://app.example.com/login");
    expect(comps.find((c) => c.key === "docs")!.url).toBe("https://docs.example.com/healthcheck");
    expect(comps.find((c) => c.key === "api")!.url).toBe("https://api.example.com/health");
    expect(comps.find((c) => c.key === "sftp")!.host).toBe("sftp.example.com");
    expect(comps.find((c) => c.key === "sftp")!.port).toBe(2222);
  });
});
