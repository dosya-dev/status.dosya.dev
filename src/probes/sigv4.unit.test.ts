import { describe, it, expect } from "vitest";
import { signV4, deriveSigningKey, hex } from "./sigv4";

const base = {
  method: "GET",
  url: "https://api.dosya.dev/s3/ws_abc?list-type=2",
  region: "auto",
  service: "s3",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  nowMs: Date.UTC(2015, 7, 30, 12, 36, 0),
};

describe("deriveSigningKey", () => {
  it("matches the key AWS publishes for its documented example", async () => {
    // Expected value: copy it from the AWS "Examples of how to derive a
    // signing key for Signature Version 4" documentation page for
    // secret wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, date 20150830,
    // region us-east-1, service iam. Copy it from the AWS page, NOT from
    // this implementation's output: a test that asserts whatever the code
    // already produces proves nothing.
    const key = await deriveSigningKey(
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      "20150830",
      "us-east-1",
      "iam",
    );
    expect(hex(key)).toBe("c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9");
  });
});

describe("signV4", () => {
  it("never signs Accept-Encoding", async () => {
    // Workers rewrite Accept-Encoding after a handler returns, so a signature
    // covering it can never verify at the origin. This assertion is the whole
    // reason this test file exists.
    const out = await signV4(base);
    expect(out.signedHeaders).not.toContain("accept-encoding");
    expect(Object.keys(out.headers).map((h) => h.toLowerCase())).not.toContain("accept-encoding");
  });

  it("signs host and the two x-amz headers, in sorted order", async () => {
    const out = await signV4(base);
    expect(out.signedHeaders).toBe("host;x-amz-content-sha256;x-amz-date");
  });

  it("builds the canonical request AWS specifies", async () => {
    const out = await signV4(base);
    expect(out.canonicalRequest).toBe(
      [
        "GET",
        "/s3/ws_abc",
        "list-type=2",
        "host:api.dosya.dev",
        "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date:20150830T123600Z",
        "",
        "host;x-amz-content-sha256;x-amz-date",
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ].join("\n"),
    );
  });

  it("produces an Authorization header with the right credential scope", async () => {
    const out = await signV4(base);
    expect(out.headers.authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20150830/auto/s3/aws4_request",
    );
    expect(out.headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("is deterministic for a fixed clock", async () => {
    const a = await signV4(base);
    const b = await signV4(base);
    expect(a.headers.authorization).toBe(b.headers.authorization);
  });
});
