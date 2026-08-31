import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, deleteUser, signInClient, svc, uniqueSuffix } from "./helpers";

// Push delivery itself (dispatch_push_notification's pg_net.http_post call)
// isn't directly assertable in this suite -- same limitation the original
// Web Push feature had. Verification here focuses on queue_sms_fallback,
// which *is* directly observable via sms_outbox, as the proxy for "the mute
// check inside both trigger functions fires correctly."
describe("notification preferences", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let guardianId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    guardianId = await createUser(`notifprefs-guardian-${suffix}@example.com`, password, {
      full_name: "Notif Prefs Guardian",
      role: "parent"
    });
    userIds.push(guardianId);

    const phoneRes = await svc(`/rest/v1/profiles?id=eq.${guardianId}`, {
      method: "PATCH",
      body: JSON.stringify({ phone: "+15551234567" })
    });
    if (!phoneRes.ok) throw new Error(`setting phone failed: ${JSON.stringify(phoneRes.body)}`);
  });

  afterAll(async () => {
    for (const id of userIds) await deleteUser(id);
  });

  async function insertNotification(type: string): Promise<string> {
    const r = await svc("/rest/v1/notifications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ recipient_id: guardianId, type, title: `Test ${type}` })
    });
    if (!r.ok) throw new Error(`insertNotification(${type}) failed: ${JSON.stringify(r.body)}`);
    return r.body[0].id as string;
  }

  async function smsCountFor(notificationId: string): Promise<number> {
    const r = await svc(`/rest/v1/sms_outbox?related_notification_id=eq.${notificationId}&select=id`);
    if (!r.ok) throw new Error(`smsCountFor failed: ${JSON.stringify(r.body)}`);
    return r.body.length as number;
  }

  it("does not queue SMS for a muted type", async () => {
    await svc(`/rest/v1/profiles?id=eq.${guardianId}`, {
      method: "PATCH",
      body: JSON.stringify({ notification_prefs: { boarding: false } })
    });
    const id = await insertNotification("boarding");
    expect(await smsCountFor(id)).toBe(0);
  });

  it("queues SMS for an unmuted type", async () => {
    await svc(`/rest/v1/profiles?id=eq.${guardianId}`, {
      method: "PATCH",
      body: JSON.stringify({ notification_prefs: { boarding: false } })
    });
    const id = await insertNotification("announcement");
    expect(await smsCountFor(id)).toBe(1);
  });

  it("always queues SMS for sos, even when explicitly muted", async () => {
    await svc(`/rest/v1/profiles?id=eq.${guardianId}`, {
      method: "PATCH",
      body: JSON.stringify({ notification_prefs: { sos: false, boarding: false, announcement: false } })
    });
    const id = await insertNotification("sos");
    expect(await smsCountFor(id)).toBe(1);
  });

  it("a signed-in guardian can write their own notification_prefs directly (profiles_update_own)", async () => {
    const client = await signInClient(`notifprefs-guardian-${suffix}@example.com`, password);
    const { error } = await client.from("profiles").update({ notification_prefs: { message: false } }).eq("id", guardianId);
    expect(error).toBeNull();

    const check = await svc(`/rest/v1/profiles?id=eq.${guardianId}&select=notification_prefs`);
    expect(check.body[0].notification_prefs).toEqual({ message: false });
  });
});
