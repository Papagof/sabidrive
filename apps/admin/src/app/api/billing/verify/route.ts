import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getUserFromAccessToken
} from "@sabidrive/supabase/server";
import { activateSchoolSubscription } from "@/lib/billing";

// Node runtime (not edge) — needs the service-role key.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * Called by /billing right after the browser redirects back from Paystack's
 * hosted checkout, so the page reflects a successful payment immediately
 * instead of waiting on the async webhook (which usually lands first
 * anyway, but isn't guaranteed to). Safe to call even if the webhook
 * already processed this reference — activateSchoolSubscription is
 * idempotent per-reference.
 */
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const anonClient = createAnonServerSupabaseClient(SUPABASE_URL, ANON_KEY);
  const caller = await getUserFromAccessToken(anonClient, token);
  if (!caller) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: callerProfile } = await serviceClient
    .from("profiles")
    .select("role, school_id")
    .eq("id", caller.id)
    .single();
  if (!callerProfile || callerProfile.role !== "admin" || !callerProfile.school_id) {
    return NextResponse.json({ error: "Only school admins can manage billing" }, { status: 403 });
  }

  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  }

  const { data: pending } = await serviceClient
    .from("billing_transactions")
    .select("school_id, student_count")
    .eq("paystack_reference", reference)
    .eq("school_id", callerProfile.school_id)
    .maybeSingle();
  if (!pending) {
    return NextResponse.json({ error: "Unknown transaction reference" }, { status: 404 });
  }

  const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
  });
  const paystackBody = await paystackResponse.json().catch(() => ({}));

  if (!paystackResponse.ok || paystackBody?.data?.status !== "success") {
    return NextResponse.json({ verified: false });
  }

  await activateSchoolSubscription(serviceClient, {
    schoolId: callerProfile.school_id,
    reference,
    amountKobo: paystackBody.data.amount,
    studentCount: pending.student_count,
    customerCode: paystackBody.data.customer?.customer_code ?? null
  });

  return NextResponse.json({ verified: true });
}
