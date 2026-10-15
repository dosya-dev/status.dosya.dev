/**
 * Minimal AWS Signature Version 4 for GET requests, over WebCrypto.
 *
 * Hand-rolled because the AWS SDK does not belong in a Worker whose whole
 * point is to have no runtime dependencies, and because we sign exactly one
 * shape of request: an unsigned-payload GET.
 *
 * The one rule that is not obvious: DO NOT sign Accept-Encoding. The Workers
 * runtime rewrites that header on the way out, so a signature covering it
 * never verifies at the origin. Sign only host and the x-amz-* headers we set
 * ourselves.
 */

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface SigV4Input {
  method: string;
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injected so the signature is deterministic in tests. */
  nowMs: number;
  payloadSha256?: string;
}

export interface SigV4Result {
  headers: Record<string, string>;
  canonicalRequest: string;
  signedHeaders: string;
}

export function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
}

export async function deriveSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** RFC3986 encoding. encodeURIComponent leaves ! ' ( ) * alone; AWS does not. */
function rfc3986(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function signV4(input: SigV4Input): Promise<SigV4Result> {
  const url = new URL(input.url);
  const payloadHash = input.payloadSha256 ?? EMPTY_SHA256;

  const iso = new Date(input.nowMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const amzDate = iso.endsWith("Z") ? iso : `${iso}Z`;
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = url.pathname.split("/").map(rfc3986).join("/");
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // Sorted by header name, which is also why the list below is in this order.
  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
    input.service,
  );
  const signature = hex(await hmac(signingKey, stringToSign));

  return {
    canonicalRequest,
    signedHeaders,
    headers: {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
