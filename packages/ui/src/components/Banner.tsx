import type { ReactNode } from "react";
import clsx from "clsx";

export type BannerTone = "info" | "caution" | "critical";

export interface BannerProps {
  tone?: BannerTone;
  title: string;
  children?: ReactNode;
  className?: string;
}

const toneClasses: Record<BannerTone, string> = {
  info: "border-brand-200 bg-brand-50 text-brand-900",
  caution: "border-caution-200 bg-caution-50 text-caution-900",
  // Reserved for true SOS / emergency banners only.
  critical: "border-critical-100 bg-critical-50 text-critical-700"
};

export function Banner({ tone = "info", title, children, className }: BannerProps) {
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={clsx("rounded-xl border px-4 py-3", toneClasses[tone], className)}
    >
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm opacity-90">{children}</div> : null}
    </div>
  );
}
