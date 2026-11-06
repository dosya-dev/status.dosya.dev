/**
 * Headers every status.dosya.dev response carries, matching dosya.dev and app:
 * HSTS, and a refusal to be framed (nothing embeds this page, so a frame can
 * only be clickjacking). A copy is made because a Response's headers can be
 * immutable (Response.redirect, a fetched response).
 */
export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  out.headers.set("content-security-policy", "frame-ancestors 'none'");
  out.headers.set("x-frame-options", "DENY");
  out.headers.set("x-content-type-options", "nosniff");
  out.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return out;
}
