import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createSchool, createUser, deleteSchool, deleteUser, setProfileSchool, signIn, svc, uniqueSuffix } from "./helpers";

/**
 * Regression test for a critical bug found in a project-wide audit (fixed in
 * 0048_protect_profile_privilege_columns.sql): profiles_update_own
 * (0003_rls_policies.sql) has no column restriction, and every admin-scoped
 * RLS policy in the schema trusts current_role()/current_school_id(), which
 * read straight off the caller's own profiles row. Before the fix, any
 * authenticated user could self-promote to admin of any school with a single
 * client-side profile update -- a full cross-tenant privilege escalation.
 */
describe("profile privilege escalation is blocked", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let victimSchoolId: string;
  let parentId: string;
  let parentToken: string;
  let driverId: string;
  let adminToken: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Priv Esc School ${suffix}`);
    victimSchoolId = await createSchool(`Priv Esc Victim ${suffix}`);

    parentId = await createUser(`privesc-parent-${suffix}@example.com`, password, { full_name: "Attacker", role: "parent" });
    await setProfileSchool(parentId, schoolId);
    parentToken = await signIn(`privesc-parent-${suffix}@example.com`, password);

    driverId = await createUser(`privesc-driver-${suffix}@example.com`, password, { full_name: "Real Driver", role: "driver" });
    await setProfileSchool(driverId, schoolId);

    const adminId = await createUser(`privesc-admin-${suffix}@example.com`, password, { full_name: "Real Admin", role: "admin" });
    await setProfileSchool(adminId, schoolId);
    adminToken = await signIn(`privesc-admin-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    await deleteSchool(victimSchoolId);
    for (const email of [`privesc-parent-${suffix}@example.com`, `privesc-driver-${suffix}@example.com`, `privesc-admin-${suffix}@example.com`]) {
      const r = await svc(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`);
      if (r.body?.[0]?.id) await deleteUser(r.body[0].id);
    }
  });

  it("does not let a parent self-promote to admin of another school", async () => {
    await asUser(parentToken, `/rest/v1/profiles?id=eq.${parentId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin", school_id: victimSchoolId })
    });
    const r = await svc(`/rest/v1/profiles?id=eq.${parentId}&select=role,school_id`);
    expect(r.body[0].role).toBe("parent");
    expect(r.body[0].school_id).toBe(schoolId);
  });

  it("does not let the escalation attempt grant read access to the victim school", async () => {
    const r = await asUser(parentToken, `/rest/v1/students?school_id=eq.${victimSchoolId}`);
    expect(r.body).toEqual([]);
  });

  it("does not let a user set their own deactivated_at, email, or verification_status", async () => {
    const before = (await svc(`/rest/v1/profiles?id=eq.${parentId}&select=email`)).body[0].email;
    await asUser(parentToken, `/rest/v1/profiles?id=eq.${parentId}`, {
      method: "PATCH",
      body: JSON.stringify({ deactivated_at: null, email: "spoofed@evil.test", verification_status: "verified" })
    });
    const after = (await svc(`/rest/v1/profiles?id=eq.${parentId}&select=email,verification_status`)).body[0];
    expect(after.email).toBe(before);
    expect(after.verification_status).toBeNull();
  });

  it("still lets an admin set a driver's verification_status in their own school", async () => {
    const r = await asUser(adminToken, `/rest/v1/profiles?id=eq.${driverId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ verification_status: "verified" })
    });
    expect(r.status).toBe(200);
    expect(r.body[0].verification_status).toBe("verified");
  });

  it("does not let a user rewrite type/title/body on their own notification row", async () => {
    const notif = await svc("/rest/v1/notifications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ recipient_id: parentId, type: "announcement", title: "Original title", body: "Original body" })
    });
    const notifId = notif.body[0].id;
    await asUser(parentToken, `/rest/v1/notifications?id=eq.${notifId}`, {
      method: "PATCH",
      body: JSON.stringify({ type: "sos", title: "Hacked", body: "Hacked" })
    });
    const after = (await svc(`/rest/v1/notifications?id=eq.${notifId}&select=type,title,body`)).body[0];
    expect(after.type).toBe("announcement");
    expect(after.title).toBe("Original title");
    // is_read is still legitimately self-writable
    const readUpdate = await asUser(parentToken, `/rest/v1/notifications?id=eq.${notifId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ is_read: true })
    });
    expect(readUpdate.body[0].is_read).toBe(true);
  });
});
