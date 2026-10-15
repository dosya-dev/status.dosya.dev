import { describe, it, expect } from "vitest";
import { resolveComponents, COMPONENT_ORDER, type Env } from "./config";

const baseEnv = {} as unknown as Env;

describe("resolveComponents", () => {
  it("returns the 7 components in fixed order with defaults", () => {
    const comps = resolveComponents(baseEnv);
    expect(comps.map((c) => c.key)).toEqual(["web", "docs", "api", "rest", "webdav", "s3", "sftp"]);
    expect(COMPONENT_ORDER).toEqual([
      "web",
      "docs",
      "api",
      "rest",
      "files",
      "webdav",
      "dav",
      "s3",
      "s3auth",
      "sftp",
    ]);
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

describe("resolveComponents, authenticated probes", () => {
  const env = {
    STATUS_DB: {} as D1Database,
    PROBE_API_KEY: "dos_test",
    PROBE_EMAIL: "smoke@example.com",
    PROBE_WORKSPACE_ID: "ws_AAAAAAAAAAAAAAAAAAAAA",
    PROBE_FOLDER_ID: "fld_BBBBBBBBBBBBBBBBBBBBB",
    PROBE_S3_ACCESS_KEY_ID: "AKIA",
    PROBE_S3_SECRET: "secret",
  };

  it("includes the three authenticated components when fully configured", () => {
    const keys = resolveComponents(env).map((c) => c.key);
    expect(keys).toContain("files");
    expect(keys).toContain("dav");
    expect(keys).toContain("s3auth");
  });

  it("lists the real tree under /All/, not the virtual workspace root", () => {
    const dav = resolveComponents(env).find((c) => c.key === "dav");
    // The workspace root is answered from a hardcoded list of the six virtual
    // collections and does no database work, so a Depth 0 PROPFIND there would
    // report green through any real listing breakage. "All" is the real tree.
    expect(dav?.url).toBe("https://api.dosya.dev/webdav/ws_AAAAAAAAAAAAAAAAAAAAA/All/");
    expect(dav?.method).toBe("PROPFIND");
    expect(dav?.auth).toBe("basic");
    expect(dav?.headers?.depth).toBe("1");
  });

  it("asks the files probe for the probe folder and asserts the body", () => {
    const files = resolveComponents(env).find((c) => c.key === "files");
    expect(files?.url).toBe(
      "https://api.dosya.dev/api/files?workspace_id=ws_AAAAAAAAAAAAAAAAAAAAA&folder_id=fld_BBBBBBBBBBBBBBBBBBBBB",
    );
    expect(files?.auth).toBe("bearer");
    expect(files?.bodyAssert).toBe("filesOk");
  });

  it("omits an authenticated component whose credentials are missing", () => {
    // A half-configured probe that reported down would be a self-inflicted
    // outage on the status page, so an unconfigured probe is absent instead.
    const keys = resolveComponents({ STATUS_DB: {} as D1Database }).map((c) => c.key);
    expect(keys).not.toContain("files");
    expect(keys).not.toContain("dav");
    expect(keys).not.toContain("s3auth");
    expect(keys).toContain("api");
  });

  it("omits s3auth when only the S3 pair is missing but keeps the other two", () => {
    const { PROBE_S3_ACCESS_KEY_ID, PROBE_S3_SECRET, ...partial } = env;
    const keys = resolveComponents(partial).map((c) => c.key);
    expect(keys).toContain("files");
    expect(keys).toContain("dav");
    expect(keys).not.toContain("s3auth");
  });

  it("orders every resolvable key within COMPONENT_ORDER", () => {
    // buildRangeSnapshot iterates COMPONENT_ORDER, so a key missing from it
    // would be probed, stored, and then never rendered.
    for (const c of resolveComponents(env)) {
      expect(COMPONENT_ORDER).toContain(c.key);
    }
  });
});
