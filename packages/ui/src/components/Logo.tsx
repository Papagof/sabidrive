import clsx from "clsx";

export interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Hide the "TripMe" wordmark and show just the bus glyph. */
  iconOnly?: boolean;
}

const sizeClasses = {
  sm: { icon: "h-6 w-6", text: "text-base" },
  md: { icon: "h-8 w-8", text: "text-xl" },
  lg: { icon: "h-11 w-11", text: "text-3xl" }
};

/** The TripMe wordmark + bus glyph -- matches apps/family/public/icons/icon.svg, the app's one source icon image. */
export function Logo({ size = "md", className, iconOnly = false }: LogoProps) {
  const { icon, text } = sizeClasses[size];
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 100 100" className={icon} aria-hidden="true">
        <rect width="100" height="100" rx="20" fill="#3866d6" />
        <path
          d="M20 60 h60 a6 6 0 0 0 6-6 V40 a6 6 0 0 0-6-6 H20 a6 6 0 0 0-6 6 v14 a6 6 0 0 0 6 6 z"
          fill="#ffffff"
        />
        <circle cx="32" cy="66" r="7" fill="#292e38" />
        <circle cx="68" cy="66" r="7" fill="#292e38" />
        <rect x="24" y="38" width="14" height="12" rx="2" fill="#3866d6" />
        <rect x="43" y="38" width="14" height="12" rx="2" fill="#3866d6" />
        <rect x="62" y="38" width="14" height="12" rx="2" fill="#3866d6" />
      </svg>
      {iconOnly ? null : <span className={clsx("font-semibold tracking-tight text-brand-800", text)}>TripMe</span>}
    </span>
  );
}
