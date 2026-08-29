import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    // Keep structured log output from drowning the test report. Tests that
    // care about logging assert on it directly rather than via stdout.
    env: { LOG_LEVEL: "silent" },
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["app/lib/**/*.ts", "app/routes/**/*.ts", "app/routes/**/*.tsx"],
    },
  },
});
