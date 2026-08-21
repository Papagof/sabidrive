import { pushQueries, type SabiDriveSupabaseClient } from "@sabidrive/supabase";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSubscribeResult = "subscribed" | "unsupported" | "denied" | "error";

/** Registers the standalone push-worker.js, subscribes, and saves it for `userId`. */
export async function subscribeToPush(supabase: SabiDriveSupabaseClient, userId: string): Promise<PushSubscribeResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_PUBLIC_KEY) {
    return "unsupported";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const registration = await navigator.serviceWorker.register("/push-worker.js", { scope: "/push-worker-scope/" });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "error";

    await pushQueries.upsertPushSubscription(supabase, {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth
    });

    return "subscribed";
  } catch (err) {
    console.error("push subscribe failed", err);
    return "error";
  }
}
