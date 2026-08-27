import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createSchool, createUser, deleteSchool, deleteUser, setProfileSchool, signIn, uniqueSuffix } from "./helpers";

// native_push_tokens (0036_native_push_tokens.sql) mirrors push_subscriptions_own's
// exact RLS shape -- no new authorization pattern, just a regression guard
// that the copy is correct.
describe("native_push_tokens RLS", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let userAId: string, userBId: string;
  let tokenA: string, tokenB: string;

  beforeAll(async () => {
    schoolId = await createSchool(`NativePush Test School ${suffix}`);
    userAId = await createUser(`npt-a-${suffix}@example.com`, password, { full_name: "NPT A", role: "driver" });
    userBId = await createUser(`npt-b-${suffix}@example.com`, password, { full_name: "NPT B", role: "driver" });
    userIds.push(userAId, userBId);
    await setProfileSchool(userAId, schoolId);
    await setProfileSchool(userBId, schoolId);

    tokenA = await signIn(`npt-a-${suffix}@example.com`, password);
    tokenB = await signIn(`npt-b-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("lets a user insert their own token", async () => {
    const res = await asUser(tokenA, "/rest/v1/native_push_tokens", {
      method: "POST",
      body: JSON.stringify({ user_id: userAId, platform: "android", token: `fcm-token-a-${suffix}` })
    });
    expect(res.ok).toBe(true);
  });

  it("rejects inserting a token for another user (impersonation)", async () => {
    const res = await asUser(tokenA, "/rest/v1/native_push_tokens", {
      method: "POST",
      body: JSON.stringify({ user_id: userBId, platform: "android", token: `fcm-token-spoofed-${suffix}` })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a platform outside the allowed check constraint", async () => {
    const res = await asUser(tokenA, "/rest/v1/native_push_tokens", {
      method: "POST",
      body: JSON.stringify({ user_id: userAId, platform: "ios", token: `fcm-token-ios-${suffix}` })
    });
    expect(res.ok).toBe(false);
  });

  it("only lets a user read their own tokens, not another user's", async () => {
    await asUser(tokenB, "/rest/v1/native_push_tokens", {
      method: "POST",
      body: JSON.stringify({ user_id: userBId, platform: "android", token: `fcm-token-b-${suffix}` })
    });

    const ownRes = await asUser(tokenA, `/rest/v1/native_push_tokens?user_id=eq.${userAId}&select=token`);
    expect(ownRes.body).toHaveLength(1);
    expect(ownRes.body[0].token).toBe(`fcm-token-a-${suffix}`);

    const otherRes = await asUser(tokenA, `/rest/v1/native_push_tokens?user_id=eq.${userBId}&select=token`);
    expect(otherRes.body).toEqual([]);
  });
});
