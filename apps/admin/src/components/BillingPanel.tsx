"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient, type SubscriptionStatus } from "@sabidrive/supabase";

type BillingTransactionRow = Awaited<ReturnType<typeof adminQueries.getBillingTransactions>>[number];

interface BillingPanelProps {
  schoolId: string;
  status: SubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  /** Called once a payment is confirmed, so the caller's useBillingStatus() re-fetches. */
  onActivated: () => void;
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment due"
};

/**
 * The subscription status + "pay now" + payment-history UI -- used both on
 * the normal /billing page (a non-blocked admin managing their
 * subscription) and embedded inside AdminShell's SubscriptionGate when the
 * school is past_due, so a blocked admin sees exactly this and nothing
 * else. Handles the ?reference= query param Paystack's checkout redirects
 * back with, verifying it via /api/billing/verify so the page reflects a
 * successful payment immediately rather than waiting on the async webhook.
 */
export function BillingPanel({ schoolId, status, trialEndsAt, currentPeriodEnd, onActivated }: BillingPanelProps) {
  const supabase = useSupabaseClient();
  const [transactions, setTransactions] = useState<BillingTransactionRow[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminQueries.getBillingTransactions(supabase, schoolId).then(setTransactions).catch(() => {});
  }, [supabase, schoolId]);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) return;
    setIsVerifying(true);
    adminQueries
      .verifySubscriptionPayment(supabase, reference)
      .then((verified) => {
        window.history.replaceState({}, "", window.location.pathname);
        if (verified) {
          onActivated();
          adminQueries.getBillingTransactions(supabase, schoolId).then(setTransactions).catch(() => {});
        }
      })
      .finally(() => setIsVerifying(false));
    // Intentionally runs once on mount only -- re-running on every prop
    // change would re-verify the same reference repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePay() {
    setIsPaying(true);
    setError(null);
    try {
      const url = await adminQueries.initializeSubscriptionCheckout(supabase);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setIsPaying(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-800">Subscription</h2>
        {status ? <StatusPill label={STATUS_LABELS[status]} tone={statusToneMap[status] ?? "neutral"} /> : null}
      </div>

      {isVerifying ? <p className="text-sm text-neutral-500">Confirming your payment…</p> : null}

      {status === "trialing" && trialEndsAt ? (
        <p className="text-sm text-neutral-600">Your free trial ends {new Date(trialEndsAt).toLocaleDateString()}.</p>
      ) : null}
      {status === "active" && currentPeriodEnd ? (
        <p className="text-sm text-neutral-600">Paid through {new Date(currentPeriodEnd).toLocaleDateString()}.</p>
      ) : null}
      {status === "past_due" ? (
        <Banner tone="caution" title="Payment required">
          Your school&apos;s access is on hold until payment is made — ₦20,000 per student, per term, covering every
          student on your roster.
        </Banner>
      ) : null}

      {error ? <p className="text-sm text-critical-600">{error}</p> : null}

      <Button variant="primary" onClick={handlePay} disabled={isPaying}>
        {isPaying ? "Starting checkout…" : status === "active" ? "Renew for next term" : "Pay now"}
      </Button>

      {transactions.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-neutral-700">Payment history</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pr-4 font-medium">Date</th>
                <th className="pr-4 font-medium">Students</th>
                <th className="pr-4 font-medium">Amount</th>
                <th className="font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="py-1 pr-4">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="py-1 pr-4">{t.student_count}</td>
                  <td className="py-1 pr-4">₦{(t.amount_kobo / 100).toLocaleString()}</td>
                  <td className="py-1">
                    <StatusPill
                      label={t.status}
                      tone={t.status === "success" ? "positive" : t.status === "failed" ? "caution" : "neutral"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
