import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "./security-headers";

describe("withSecurityHeaders", () => {
  it("adds HSTS and the framing refusal while keeping status, body and existing headers", async () => {
    const res = withSecurityHeaders(
      new Response("hi", { status: 201, headers: { "content-type": "text/plain", "cache-control": "public, max-age=30" } }),
    );
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("hi");
    expect(res.headers.get("cache-control")).toBe("public, max-age=30");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("works on a response whose headers are immutable", () => {
    const res = withSecurityHeaders(Response.redirect("https://status.dosya.dev/", 301));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://status.dosya.dev/");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
