import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The headless core carries the logic and is covered thoroughly. The DOM
      // view layer (ui/), React bindings, barrels, and pure type modules are
      // excluded from thresholds.
      exclude: [
        "src/index.ts",
        "src/react/index.tsx",
        "src/ui/**",
        "src/core/types.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
