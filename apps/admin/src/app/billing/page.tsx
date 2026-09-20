"use client";

import { AdminShell } from "@/components/AdminShell";
import { BillingPanel } from "@/components/BillingPanel";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { useBillingStatus } from "@sabidrive/supabase";

/**
 * The non-blocked "manage your subscription" view -- reachable any time
 * from the nav. Reuses the exact same BillingPanel AdminShell embeds inside
 * its full-screen SubscriptionGate when the school is past_due, just framed
 * here as a normal page rather than a blocking screen.
 */
export default function BillingPage() {
  const { profile, isLoading } = useRequireAdmin();
  const billing = useBillingStatus(profile?.school_id ?? null);

  if (isLoading || !profile?.school_id) {
    return (
      <AdminShell>
        <p className="text-neutral-500">Loading…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Billing</h1>
        <BillingPanel
          schoolId={profile.school_id}
          status={billing.status}
          trialEndsAt={billing.trialEndsAt}
          currentPeriodEnd={billing.currentPeriodEnd}
          onActivated={billing.refresh}
        />
      </div>
    </AdminShell>
  );
}
