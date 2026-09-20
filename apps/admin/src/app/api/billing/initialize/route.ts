import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getUserFromAccessToken
} from "@sabidrive/supabase/server";
import { computeBillingAmountKobo } from "@sabidrive/supabase";

// Node runtime (not edge) — needs the service-role key.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * Starts a Paystack hosted-checkout transaction for the caller's own school
 * -- ₦20,000 per student on the roster, per term (packages/supabase/src/billing.ts).
 * Admin-only, same bearer-token -> caller's own profiles.role check as
 * invite-user/route.ts. Amount and school_id are always computed/derived
 * server-side from the verified caller, never taken from the request body.
 */
export async function POST(req: Request) {
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
  const { data: callerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role, school_id, email")
    .eq("id", caller.id)
    .single();

  if (profileError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.school_id) {
    return NextResponse.json({ error: "Only school admins can manage billing" }, { status: 403 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  }

  const { count: studentCount, error: countError } = await serviceClient
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", callerProfile.school_id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if (!studentCount) {
    return NextResponse.json({ error: "Add at least one student before subscribing" }, { status: 400 });
  }

  const amountKobo = computeBillingAmountKobo(studentCount);
  const callbackUrl = `${new URL(req.url).origin}/billing`;

  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: callerProfile.email,
      amount: amountKobo,
      currency: "NGN",
      metadata: { school_id: callerProfile.school_id },
      callback_url: callbackUrl
    })
  });
  const paystackBody = await paystackResponse.json().catch(() => ({}));

  if (!paystackResponse.ok || !paystackBody?.status) {
    return NextResponse.json({ error: paystackBody?.message ?? "Failed to start checkout" }, { status: 502 });
  }

  const reference: string = paystackBody.data.reference;
  await serviceClient.from("billing_transactions").insert({
    school_id: callerProfile.school_id,
    paystack_reference: reference,
    amount_kobo: amountKobo,
    student_count: studentCount,
    status: "pending"
  });

  return NextResponse.json({ authorization_url: paystackBody.data.authorization_url });
}
