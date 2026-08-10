import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "sos";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600",
  secondary:
    "bg-white text-brand-700 border border-brand-200 hover:bg-brand-50 focus-visible:outline-brand-600",
  ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100 focus-visible:outline-neutral-500",
  // Reserved for true SOS / emergency actions only — see packages/ui tokens/colors.ts.
  sos: "bg-critical-600 text-white hover:bg-critical-700 focus-visible:outline-critical-600"
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "min-h-control px-4 text-base",
  lg: "min-h-[3.5rem] px-6 text-lg"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex min-w-control items-center justify-center gap-2 rounded-xl font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
});
