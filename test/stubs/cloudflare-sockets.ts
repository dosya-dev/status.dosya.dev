// Test stub for the `cloudflare:sockets` runtime module, which only exists
// inside the Workers runtime. Unit tests import pure helpers from probes/sftp.ts;
// the socket code path is exercised only by the manual/integration checklist.
export function connect(): never {
  throw new Error("cloudflare:sockets connect() is not available under vitest (node env)");
}
