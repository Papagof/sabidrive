// Deno edge function, deployed via the Supabase MCP `deploy_edge_function` tool.
// Called by the 0016 migration's pg_net trigger on `notifications` INSERT —
// not by browser clients — so verify_jwt is off and it authenticates the
// caller via a shared-secret header instead (value lives in Supabase Vault
// on the Postgres side, and as an Edge Function secret here).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { GoogleAuth } from "npm:google-auth-library@9";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const PUSH_DISPATCH_SECRET = Deno.env.get("PUSH_DISPATCH_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Native push (Android/FCM, 0036_native_push_tokens.sql) — Web Push is
// unreliable inside the Capacitor WebView, so a native FCM token gets a real
// push instead. Gracefully no-ops the whole branch if the secret isn't set,
// same defensive shape as dispatch_push_notification's own Vault-secret
// check (0016_push_dispatch_trigger.sql) — this function must keep working
// for Web Push subscribers even before FCM is configured.
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
let fcmProjectId: string | null = null;
let fcmAuth: GoogleAuth | null = null;
if (FCM_SERVICE_ACCOUNT_JSON) {
  try {
    const credentials = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
    fcmProjectId = credentials.project_id;
    fcmAuth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
  } catch (err) {
    console.error("invalid FCM_SERVICE_ACCOUNT_JSON", err);
  }
}

async function sendFcmPush(token: string, title: string, body: string): Promise<void> {
  if (!fcmAuth || !fcmProjectId) return;
  const client = await fcmAuth.getClient();
  const { token: accessToken } = await client.getAccessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title, body } } })
  });
  if (!res.ok) throw new Error(`FCM send failed: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-push-dispatch-secret") !== PUSH_DISPATCH_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const { notification_id } = await req.json();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: notification } = await supabase
    .from("notifications")
    .select("title, body, recipient_id")
    .eq("id", notification_id)
    .single();
  if (!notification) return new Response("notification not found", { status: 404 });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", notification.recipient_id);

  const { data: nativeTokens } = await supabase
    .from("native_push_tokens")
    .select("token, platform")
    .eq("user_id", notification.recipient_id);

  await Promise.all([
    ...(subs ?? []).map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: notification.title, body: notification.body ?? "" })
        )
        .catch((err: unknown) => console.error("push send failed", err))
    ),
    ...(nativeTokens ?? [])
      .filter((t) => t.platform === "android")
      .map((t) =>
        sendFcmPush(t.token, notification.title, notification.body ?? "").catch((err: unknown) =>
          console.error("fcm send failed", err)
        )
      )
  ]);

  return new Response("ok", { status: 200 });
});
