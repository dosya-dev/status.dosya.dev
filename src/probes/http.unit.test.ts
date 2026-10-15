import { describe, it, expect } from "vitest";
import { interpretHttp, assertBody } from "./http";

describe("interpretHttp, existing keys", () => {
  it("web is up on any 2xx or 3xx", () => {
    expect(interpretHttp("web", { status: 200 })).toBe("up");
    expect(interpretHttp("web", { status: 302 })).toBe("up");
    expect(interpretHttp("web", { status: 500 })).toBe("down");
    expect(interpretHttp("web", { status: 404 })).toBe("down");
  });
  it("docs degrades when it reports itself unhealthy", () => {
    expect(interpretHttp("docs", { status: 200, healthOk: true })).toBe("up");
    expect(interpretHttp("docs", { status: 200, healthOk: false })).toBe("degraded");
    expect(interpretHttp("docs", { status: 200, healthOk: null })).toBe("degraded");
    expect(interpretHttp("docs", { status: 302 })).toBe("down");
    expect(interpretHttp("docs", { status: 502 })).toBe("down");
  });
  it("api degrades on 503 and needs ok:true on 200", () => {
    expect(interpretHttp("api", { status: 200, healthOk: true })).toBe("up");
    expect(interpretHttp("api", { status: 200, healthOk: false })).toBe("down");
    expect(interpretHttp("api", { status: 503 })).toBe("degraded");
    expect(interpretHttp("api", { status: 500 })).toBe("down");
  });
  it("rest accepts 401, 200, or 403 as up", () => {
    expect(interpretHttp("rest", { status: 401 })).toBe("up");
    expect(interpretHttp("rest", { status: 200 })).toBe("up");
    expect(interpretHttp("rest", { status: 403 })).toBe("up");
    expect(interpretHttp("rest", { status: 500 })).toBe("down");
  });
  it("webdav needs 200 with the DAV header", () => {
    expect(interpretHttp("webdav", { status: 200, davHeaderPresent: true })).toBe("up");
    expect(interpretHttp("webdav", { status: 200, davHeaderPresent: false })).toBe("down");
    expect(interpretHttp("webdav", { status: 401, davHeaderPresent: true })).toBe("down");
  });
  it("s3 accepts 200, 400, or 403 as up", () => {
    expect(interpretHttp("s3", { status: 403 })).toBe("up");
    expect(interpretHttp("s3", { status: 400 })).toBe("up");
    expect(interpretHttp("s3", { status: 200 })).toBe("up");
    expect(interpretHttp("s3", { status: 500 })).toBe("down");
  });
  it("a null status is always down", () => {
    expect(interpretHttp("web", { status: null })).toBe("down");
    expect(interpretHttp("api", { status: null })).toBe("down");
    expect(interpretHttp("s3", { status: null })).toBe("down");
  });
});

describe("interpretHttp, authenticated keys", () => {
  it("files needs 200 AND a successful body", () => {
    expect(interpretHttp("files", { status: 200, bodyOk: true })).toBe("up");
    expect(interpretHttp("files", { status: 200, bodyOk: false })).toBe("down");
    expect(interpretHttp("files", { status: 200, bodyOk: null })).toBe("down");
  });
  it("files is down on a revoked or expired credential", () => {
    expect(interpretHttp("files", { status: 401, bodyOk: null })).toBe("down");
    expect(interpretHttp("files", { status: 403, bodyOk: null })).toBe("down");
  });
  it("files is down on the rate limiter", () => {
    expect(interpretHttp("files", { status: 429, bodyOk: null })).toBe("down");
  });
  it("dav needs exactly 207", () => {
    expect(interpretHttp("dav", { status: 207 })).toBe("up");
    expect(interpretHttp("dav", { status: 200 })).toBe("down");
    expect(interpretHttp("dav", { status: 401 })).toBe("down");
    expect(interpretHttp("dav", { status: 400 })).toBe("down");
  });
  it("s3auth needs 200 AND a ListBucketResult body", () => {
    expect(interpretHttp("s3auth", { status: 200, bodyOk: true })).toBe("up");
    expect(interpretHttp("s3auth", { status: 200, bodyOk: false })).toBe("down");
    expect(interpretHttp("s3auth", { status: 403, bodyOk: null })).toBe("down");
  });
});

describe("interpretHttp, unknown key", () => {
  it("fails closed", () => {
    expect(interpretHttp("typo", { status: 200 })).toBe("down");
    expect(interpretHttp("typo", { status: 401 })).toBe("down");
  });
});

describe("assertBody", () => {
  it("filesOk requires ok:true", () => {
    expect(assertBody("filesOk", '{"ok":true,"files":[]}')).toBe(true);
    expect(assertBody("filesOk", '{"ok":false,"error":"Not found"}')).toBe(false);
  });
  it("filesOk rejects an HTML error page served with 200", () => {
    expect(assertBody("filesOk", "<!DOCTYPE html><title>404</title>")).toBe(false);
    expect(assertBody("filesOk", "")).toBe(false);
  });
  it("listBucketResult looks for the S3 listing element", () => {
    expect(assertBody("listBucketResult", "<ListBucketResult><Name>x</Name></ListBucketResult>")).toBe(true);
    expect(assertBody("listBucketResult", "<Error><Code>AccessDenied</Code></Error>")).toBe(false);
  });
  it("passes when no assertion is configured", () => {
    expect(assertBody(undefined, "anything")).toBe(true);
  });
});
