import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // These hit the real network (Supabase REST/Auth), and each test creates
    // and tears down a disposable school -- give them more room than the
    // default 5s before flagging a hang as a failure.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Real writes/deletes against production data -- one test file at a time
    // avoids two disposable schools racing each other for no benefit.
    fileParallelism: false
  }
});
