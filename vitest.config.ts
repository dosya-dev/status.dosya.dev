import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `cloudflare:sockets` only exists in the Workers runtime; stub it for node-based unit tests.
      "cloudflare:sockets": path.join(here, "test/stubs/cloudflare-sockets.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.unit.test.ts"],
  },
});
