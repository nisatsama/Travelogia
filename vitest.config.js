import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["backend/tests/**/*.test.js", "frontend/src/__tests__/**/*.test.js"],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
