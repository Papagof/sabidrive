import { createServiceRoleSupabaseClient } from "@sabidrive/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleSupabaseClient>;

interface ActivateSubscriptionInput {
  schoolId: string;
  reference: string;
  amountKobo: number;
  studentCount: number;
  customerCode?: string | null;
}

/**
 * Shared by /api/billing/webhook and /api/billing/verify -- both routes can
 * end up confirming the same successful Paystack transaction (an async
 * webhook plus a synchronous check on redirect-back), so this is written
 * to be safe to call twice for the same `reference`: it no-ops if a
 * `billing_transactions` row for that reference is already `success`.
 */
export async function activateSchoolSubscription(serviceClient: ServiceClient, input: ActivateSubscriptionInput) {
  const { schoolId, reference, amountKobo, studentCount, customerCode } = input;

  const { data: existing } = await serviceClient
    .from("billing_transactions")
    .select("id, status")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (existing?.status === "success") {
    return { alreadyProcessed: true };
  }

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 3);

  await serviceClient.from("billing_transactions").upsert(
    {
      school_id: schoolId,
      paystack_reference: reference,
      amount_kobo: amountKobo,
      student_count: studentCount,
      status: "success",
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString()
    },
    { onConflict: "paystack_reference" }
  );

  await serviceClient
    .from("schools")
    .update({
      subscription_status: "active",
      trial_ends_at: null,
      current_period_end: periodEnd.toISOString(),
      paystack_customer_code: customerCode ?? null
    })
    .eq("id", schoolId);

  await serviceClient.from("audit_log").insert({
    school_id: schoolId,
    actor_id: null,
    action: "subscription_activated",
    target_id: schoolId,
    details: { reference, amount_kobo: amountKobo, student_count: studentCount }
  });

  return { alreadyProcessed: false };
}
