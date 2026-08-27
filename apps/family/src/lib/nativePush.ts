import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { pushQueries, type SabiDriveSupabaseClient } from "@sabidrive/supabase";
import type { PushSubscribeResult } from "./push";

/**
 * Web Push (push.ts) is unreliable inside the Capacitor WebView -- especially
 * iOS, where WKWebView doesn't support the browser Push API the way an
 * installed-PWA Safari tab does. This is the real fix for the native app:
 * register for a native FCM token and save it to native_push_tokens
 * (0036_native_push_tokens.sql) instead. Android only for now -- iOS needs a
 * real Apple Developer account + APNs key and isn't wired on the native
 * project side yet.
 */
export async function subscribeToNativePush(supabase: SabiDriveSupabaseClient, userId: string): Promise<PushSubscribeResult> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return "unsupported";
  }

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return "denied";

  return new Promise((resolve) => {
    const registrationHandle = PushNotifications.addListener("registration", async (token) => {
      void registrationHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
      try {
        await pushQueries.upsertNativePushToken(supabase, { user_id: userId, platform: "android", token: token.value });
        resolve("subscribed");
      } catch (err) {
        console.error("native push token save failed", err);
        resolve("error");
      }
    });
    const errorHandle = PushNotifications.addListener("registrationError", (err) => {
      void registrationHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
      console.error("native push registration failed", err);
      resolve("error");
    });
    void PushNotifications.register();
  });
}
