import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@sabidrive/supabase/server";
import { activateSchoolSubscription } from "@/lib/billing";

// Node runtime (not edge) — needs the service-role key and Node's crypto module.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * Paystack's async payment webhook -- public (no bearer token, Paystack
 * calls it directly), authenticated instead via Paystack's documented
 * `x-paystack-signature` scheme: an HMAC-SHA512 of the raw request body
 * keyed by the secret key. Verified against the *raw* body before any JSON
 * parsing, same reasoning as any webhook signature check -- parsing first
 * and re-serializing to verify would risk a mismatch from key
 * reordering/whitespace.
 */
export async function POST(req: Request) {
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  const expected = createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");

  const signatureBuffer = Buffer.from(signature ?? "", "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const isValid =
    signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event === "charge.success") {
    const data = event.data ?? {};
    const schoolId: string | undefined = data.metadata?.school_id;
    const reference: string | undefined = data.reference;
    if (schoolId && reference) {
      const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: pending } = await serviceClient
        .from("billing_transactions")
        .select("student_count")
        .eq("paystack_reference", reference)
        .maybeSingle();
      await activateSchoolSubscription(serviceClient, {
        schoolId,
        reference,
        amountKobo: data.amount ?? 0,
        studentCount: pending?.student_count ?? 0,
        customerCode: data.customer?.customer_code ?? null
      });
    }
  }

  // Always 200 once the signature checks out -- Paystack retries on non-2xx.
  return NextResponse.json({ ok: true });
}
