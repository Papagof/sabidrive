import type { SabiDriveSupabaseClient } from "../client";

export interface PushSubscriptionInput {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

export async function upsertPushSubscription(supabase: SabiDriveSupabaseClient, input: PushSubscriptionInput) {
  const { error } = await supabase.from("push_subscriptions").upsert(input, { onConflict: "endpoint" });
  if (error) throw error;
}

export interface NativePushTokenInput {
  user_id: string;
  platform: "android";
  token: string;
}

/** Web Push is unreliable inside the Capacitor WebView (especially iOS); native push tokens (FCM/APNs) get their own table -- see 0036_native_push_tokens.sql. */
export async function upsertNativePushToken(supabase: SabiDriveSupabaseClient, input: NativePushTokenInput) {
  const { error } = await supabase.from("native_push_tokens").upsert(input, { onConflict: "token" });
  if (error) throw error;
}
