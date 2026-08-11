import clsx from "clsx";

export type StatusTone = "neutral" | "info" | "positive" | "caution" | "critical";

export interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  info: "bg-brand-50 text-brand-700",
  positive: "bg-calm-50 text-calm-700",
  caution: "bg-caution-50 text-caution-700",
  // Reserved for true SOS / emergency states only.
  critical: "bg-critical-50 text-critical-700"
};

/** Maps common Tripme domain statuses to a StatusTone. */
export const statusToneMap: Record<string, StatusTone> = {
  scheduled: "neutral",
  in_progress: "info",
  completed: "positive",
  cancelled: "neutral",
  pending: "neutral",
  boarded: "positive",
  missed: "caution",
  excused: "neutral",
  info: "info",
  warning: "caution",
  sos: "critical",
  verified: "positive",
  rejected: "caution",
  active: "info",
  inactive: "neutral",
  resolved: "positive",
  simulated_sent: "neutral"
};

export function StatusPill({ label, tone = "neutral", className }: StatusPillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
        toneClasses[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
