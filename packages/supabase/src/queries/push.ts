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
