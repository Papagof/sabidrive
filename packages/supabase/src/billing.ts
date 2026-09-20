/**
 * Pure billing math for the per-student, per-term subscription (see
 * CLAUDE.md's "School subscriptions & billing (Paystack)" section) -- no
 * Supabase client, no network, fully unit-testable. Mirrors reports.ts's own
 * fetch/compute split.
 */

const NAIRA_PER_STUDENT_PER_TERM = 20_000;
const KOBO_PER_NAIRA = 100;

/** Every student on the roster counts, regardless of route assignment (product decision). */
export function computeBillingAmountKobo(studentCount: number): number {
  return Math.max(0, studentCount) * NAIRA_PER_STUDENT_PER_TERM * KOBO_PER_NAIRA;
}
