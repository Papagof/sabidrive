"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password `<input>` with a show/hide toggle, matching the app's usual input styling. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={clsx(
          "min-h-control w-full rounded-lg border border-neutral-300 px-3 pr-11 text-base focus:border-brand-500 focus:outline-none",
          className
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-600"
      >
        {visible ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 3l18 18M10.6 10.7a2.5 2.5 0 0 0 3.5 3.5M7.4 7.5C4.9 9 3.2 11 2.5 12c1.6 2.5 5 7 9.5 7 1.7 0 3.2-.6 4.5-1.5M17 16.2c1.6-1.3 2.8-2.9 3.5-4.2-1.6-2.5-5-7-9.5-7-.9 0-1.8.2-2.6.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        )}
      </button>
    </div>
  );
});
