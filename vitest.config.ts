import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["app/lib/**/*.ts", "app/routes/**/*.ts", "app/routes/**/*.tsx"],
    },
  },
});
