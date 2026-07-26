import { describe, it, expect } from "vitest";
import { interpretHttp } from "./http";

describe("interpretHttp", () => {
  it("web: 2xx/3xx => up; 5xx/4xx-non-redirect => down", () => {
    expect(interpretHttp("web", 200, false, null)).toBe("up");
    expect(interpretHttp("web", 302, false, null)).toBe("up");
    expect(interpretHttp("web", 500, false, null)).toBe("down");
    expect(interpretHttp("web", 404, false, null)).toBe("down");
    expect(interpretHttp("web", null, false, null)).toBe("down");
  });
  it("api: 200 + ok:true => up; 503 => degraded; else down", () => {
    expect(interpretHttp("api", 200, false, true)).toBe("up");
    expect(interpretHttp("api", 200, false, false)).toBe("down");
    expect(interpretHttp("api", 503, false, false)).toBe("degraded");
    expect(interpretHttp("api", 500, false, null)).toBe("down");
  });
  it("rest: 401/200/403 => up; 500 => down", () => {
    expect(interpretHttp("rest", 401, false, null)).toBe("up");
    expect(interpretHttp("rest", 200, false, null)).toBe("up");
    expect(interpretHttp("rest", 403, false, null)).toBe("up");
    expect(interpretHttp("rest", 500, false, null)).toBe("down");
  });
  it("webdav: 200 with DAV header => up; 200 without => down", () => {
    expect(interpretHttp("webdav", 200, true, null)).toBe("up");
    expect(interpretHttp("webdav", 200, false, null)).toBe("down");
    expect(interpretHttp("webdav", 401, true, null)).toBe("down");
  });
  it("s3: 200/400/403 => up; else down", () => {
    expect(interpretHttp("s3", 403, false, null)).toBe("up");
    expect(interpretHttp("s3", 400, false, null)).toBe("up");
    expect(interpretHttp("s3", 500, false, null)).toBe("down");
  });
  it("null status (network error/timeout) => down", () => {
    expect(interpretHttp("api", null, false, null)).toBe("down");
    expect(interpretHttp("s3", null, false, null)).toBe("down");
  });
});
