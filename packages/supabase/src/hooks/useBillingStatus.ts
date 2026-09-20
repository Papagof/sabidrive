"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabaseClient } from "../context";

export type SubscriptionStatus = "trialing" | "active" | "past_due";

export interface BillingStatusState {
  status: SubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isLoading: boolean;
  /** True once a school must pay before the app is usable again. */
  isBlocked: boolean;
  refresh: () => void;
}

/**
 * Reads a school's subscription status directly off `schools` -- already
 * readable under the existing `schools_select_member` policy
 * (0003_rls_policies.sql), so no new route/RPC is needed just to check it.
 * Shared by both apps: AdminShell gates the whole admin app on it, and
 * apps/family/src/lib/useRequireRole.ts folds it into its existing guard
 * hooks so every authenticated family page gets the same enforcement for
 * free.
 */
export function useBillingStatus(schoolId: string | null): BillingStatusState {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!schoolId) {
      setStatus(null);
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    setIsLoading(true);
    supabase
      .from("schools")
      .select("subscription_status, trial_ends_at, current_period_end")
      .eq("id", schoolId)
      .single()
      .then(({ data }) => {
        if (!isMounted) return;
        setStatus((data?.subscription_status as SubscriptionStatus) ?? null);
        setTrialEndsAt(data?.trial_ends_at ?? null);
        setCurrentPeriodEnd(data?.current_period_end ?? null);
        setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [supabase, schoolId, nonce]);

  return { status, trialEndsAt, currentPeriodEnd, isLoading, isBlocked: status === "past_due", refresh };
}
