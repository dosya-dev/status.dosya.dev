import { defineConfig, coverageConfigDefaults } from "vitest/config";
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
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "./coverage",
      // Without this, vitest's exclude list only filters the untested-file
      // glob; raw V8 process coverage passes straight into the report
      // unfiltered.
      excludeAfterRemap: true,
      // Positive filter: only first-party source under src/ counts.
      include: ["src/**"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "**/*.test.ts",
        "**/*.unit.test.ts",
        "**/*.int.test.ts",
        // The cloudflare:sockets stub lives at test/stubs/, not test-stubs/.
        "**/test/stubs/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/*.config.ts",
      ],
    },
  },
});
