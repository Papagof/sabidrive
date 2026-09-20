import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createSchool, createUser, deleteSchool, deleteUser, setProfileSchool, signIn, svc, uniqueSuffix } from "./helpers";

/**
 * Covers 0053_school_billing.sql: the privilege-protection trigger on the
 * new schools.subscription_status/trial_ends_at/current_period_end/
 * paystack_customer_code/deactivated_at columns (same shape as
 * profile_privilege_escalation.test.ts), the daily expiry sweep, and the
 * new billing_transactions RLS policy.
 */
describe("school billing", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let otherSchoolId: string;
  let adminId: string;
  let adminToken: string;
  let otherAdminId: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Billing School ${suffix}`);
    otherSchoolId = await createSchool(`Billing Other School ${suffix}`);

    adminId = await createUser(`billing-admin-${suffix}@example.com`, password, { full_name: "Admin", role: "admin" });
    await setProfileSchool(adminId, schoolId);
    adminToken = await signIn(`billing-admin-${suffix}@example.com`, password);

    otherAdminId = await createUser(`billing-other-admin-${suffix}@example.com`, password, { full_name: "Other Admin", role: "admin" });
    await setProfileSchool(otherAdminId, otherSchoolId);
    otherAdminToken = await signIn(`billing-other-admin-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    await deleteSchool(otherSchoolId);
    await deleteUser(adminId);
    await deleteUser(otherAdminId);
  });

  it("does not let a school's own admin write the new billing columns directly", async () => {
    const before = (await svc(`/rest/v1/schools?id=eq.${schoolId}&select=subscription_status,trial_ends_at,current_period_end,paystack_customer_code,deactivated_at`)).body[0];

    await asUser(adminToken, `/rest/v1/schools?id=eq.${schoolId}`, {
      method: "PATCH",
      body: JSON.stringify({
        subscription_status: "active",
        trial_ends_at: null,
        current_period_end: "2099-01-01T00:00:00Z",
        paystack_customer_code: "CUS_spoofed",
        deactivated_at: null
      })
    });

    const after = (await svc(`/rest/v1/schools?id=eq.${schoolId}&select=subscription_status,trial_ends_at,current_period_end,paystack_customer_code,deactivated_at`)).body[0];
    expect(after).toEqual(before);
  });

  it("still lets the admin update an ordinary column (name) on the same request shape", async () => {
    const r = await asUser(adminToken, `/rest/v1/schools?id=eq.${schoolId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: `Billing School ${suffix} (renamed)` })
    });
    expect(r.status).toBe(200);
    expect(r.body[0].name).toBe(`Billing School ${suffix} (renamed)`);
  });

  it("expire_stale_subscriptions flips an expired trial to past_due and leaves an unexpired one alone", async () => {
    const expiredSchool = await createSchool(`Billing Expired ${suffix}`);
    const freshSchool = await createSchool(`Billing Fresh ${suffix}`);
    try {
      await svc(`/rest/v1/schools?id=eq.${expiredSchool}`, {
        method: "PATCH",
        body: JSON.stringify({ subscription_status: "trialing", trial_ends_at: "2020-01-01T00:00:00Z" })
      });
      await svc(`/rest/v1/schools?id=eq.${freshSchool}`, {
        method: "PATCH",
        body: JSON.stringify({ subscription_status: "trialing", trial_ends_at: "2099-01-01T00:00:00Z" })
      });

      const rpcResult = await svc("/rest/v1/rpc/expire_stale_subscriptions", { method: "POST", body: "{}" });
      expect(rpcResult.ok).toBe(true);

      const expiredAfter = (await svc(`/rest/v1/schools?id=eq.${expiredSchool}&select=subscription_status`)).body[0];
      const freshAfter = (await svc(`/rest/v1/schools?id=eq.${freshSchool}&select=subscription_status`)).body[0];
      expect(expiredAfter.subscription_status).toBe("past_due");
      expect(freshAfter.subscription_status).toBe("trialing");
    } finally {
      await deleteSchool(expiredSchool);
      await deleteSchool(freshSchool);
    }
  });

  it("lets an admin read their own school's billing_transactions but not another school's", async () => {
    const txn = await svc("/rest/v1/billing_transactions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        school_id: schoolId,
        paystack_reference: `test-ref-${suffix}`,
        amount_kobo: 2_000_000,
        student_count: 1,
        status: "success"
      })
    });
    expect(txn.ok).toBe(true);

    const ownRead = await asUser(adminToken, `/rest/v1/billing_transactions?school_id=eq.${schoolId}`);
    expect(ownRead.body).toHaveLength(1);
    expect(ownRead.body[0].paystack_reference).toBe(`test-ref-${suffix}`);

    const crossRead = await asUser(otherAdminToken, `/rest/v1/billing_transactions?school_id=eq.${schoolId}`);
    expect(crossRead.body).toEqual([]);
  });
});
