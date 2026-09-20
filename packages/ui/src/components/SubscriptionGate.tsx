import type { ReactNode } from "react";
import { Button } from "./Button";

export interface SubscriptionGateProps {
  /** "pay" (admin app -- embeds the billing panel as children) or "contact-admin" (family app -- every role there, no action available). */
  variant: "pay" | "contact-admin";
  title: string;
  description: string;
  onSignOut: () => void;
  children?: ReactNode;
}

/**
 * Full-screen block shown in place of the whole app when a school's
 * subscription is past due -- same centered-column shape as the existing
 * "No bus assigned" state (apps/family/src/app/driver/page.tsx), reused here
 * since it's the closest existing full-page blocking pattern in the app.
 */
export function SubscriptionGate({ variant, title, description, onSignOut, children }: SubscriptionGateProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-brand-800">{title}</h1>
      <p className="text-neutral-600">{description}</p>
      {variant === "pay" && children ? <div className="w-full text-left">{children}</div> : null}
      <Button variant="ghost" size="md" onClick={onSignOut}>
        Sign out
      </Button>
    </main>
  );
}
