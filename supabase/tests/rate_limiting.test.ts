import { afterAll, describe, expect, it } from "vitest";
import { svc, uniqueSuffix } from "./helpers";

// check_rate_limit is only callable via service-role (revoked from
// anon/authenticated entirely, 0037_rate_limiting.sql) -- it's never meant
// to be called from a browser session, only from a Route Handler's
// service-role client. No school/user fixtures needed since buckets are
// bare strings.
describe("check_rate_limit", () => {
  const bucket = `test-bucket-${uniqueSuffix()}`;

  afterAll(async () => {
    await svc(`/rest/v1/rate_limit_hits?bucket=eq.${bucket}`, { method: "DELETE" });
  });

  async function call(maxAttempts: number, windowSeconds: number) {
    const res = await svc("/rest/v1/rpc/check_rate_limit", {
      method: "POST",
      body: JSON.stringify({ p_bucket: bucket, p_max_attempts: maxAttempts, p_window_seconds: windowSeconds })
    });
    if (!res.ok) throw new Error(`check_rate_limit failed: ${JSON.stringify(res.body)}`);
    return res.body as boolean;
  }

  it("allows attempts under the max", async () => {
    expect(await call(3, 10)).toBe(true);
    expect(await call(3, 10)).toBe(true);
    expect(await call(3, 10)).toBe(true);
  });

  it("rejects once the max is hit within the window", async () => {
    expect(await call(3, 10)).toBe(false);
  });

  it("allows again once the window has passed", async () => {
    // A fresh bucket with a 1-second window -- wait it out, then confirm a clean slate.
    const shortBucket = `${bucket}-short`;
    async function callShort() {
      const res = await svc("/rest/v1/rpc/check_rate_limit", {
        method: "POST",
        body: JSON.stringify({ p_bucket: shortBucket, p_max_attempts: 1, p_window_seconds: 1 })
      });
      return res.body as boolean;
    }
    expect(await callShort()).toBe(true);
    expect(await callShort()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await callShort()).toBe(true);
    await svc(`/rest/v1/rate_limit_hits?bucket=eq.${shortBucket}`, { method: "DELETE" });
  });
});
