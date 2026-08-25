import Link from "next/link";
import { Card, Logo } from "@sabidrive/ui";

const ADMIN_APP_URL = "https://admin-nine-tau-50.vercel.app";

// Purely decorative -- a slow drift of bus silhouettes behind the sign-in
// choice, so the one page with no live data of its own still feels alive.
// Negative animation-delay pre-scatters each bus along its lane instead of
// bunching them all at the left edge on load; prefers-reduced-motion turns
// the animation off entirely (see globals.css).
const LANES: { top: string; duration: string; delay: string; color: string; scale: number }[] = [
  { top: "8%", duration: "26s", delay: "-4s", color: "text-brand-200", scale: 1 },
  { top: "22%", duration: "34s", delay: "-18s", color: "text-calm-200", scale: 0.8 },
  { top: "68%", duration: "30s", delay: "-9s", color: "text-brand-100", scale: 1.15 },
  { top: "82%", duration: "22s", delay: "-14s", color: "text-calm-100", scale: 0.9 },
  { top: "45%", duration: "40s", delay: "-27s", color: "text-neutral-200", scale: 0.7 }
];

function BusSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 32" fill="currentColor" className={className} aria-hidden="true">
      <rect x="2" y="6" width="56" height="18" rx="4" />
      <rect x="2" y="6" width="56" height="7" rx="3" opacity="0.55" />
      <circle cx="16" cy="26" r="5" />
      <circle cx="48" cy="26" r="5" />
      <circle cx="16" cy="26" r="2" className="text-white" fill="currentColor" opacity="0.9" />
      <circle cx="48" cy="26" r="2" className="text-white" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function AnimatedBusesBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {LANES.map((lane, i) => (
        <div
          key={i}
          className={`animate-bus-drive absolute ${lane.color}`}
          style={{
            top: lane.top,
            animationDuration: lane.duration,
            animationDelay: lane.delay,
            width: `${64 * lane.scale}px`
          }}
        >
          <BusSilhouette className="h-auto w-full" />
        </div>
      ))}
    </div>
  );
}

export default function ChoosePage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <AnimatedBusesBackdrop />

      <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-center backdrop-blur-sm">
        <Logo size="lg" />
        <p className="text-neutral-600">Track school buses, safely and live. Choose how you&apos;re signing in.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Link href="/login">
          <Card className="flex flex-col gap-1 transition hover:border-brand-300">
            <p className="text-lg font-medium text-brand-800">Parent or Driver</p>
            <p className="text-sm text-neutral-500">Track your child&apos;s bus, or run your route as a driver.</p>
          </Card>
        </Link>

        <a href={`${ADMIN_APP_URL}/login`}>
          <Card className="flex flex-col gap-1 transition hover:border-brand-300">
            <p className="text-lg font-medium text-brand-800">School Admin</p>
            <p className="text-sm text-neutral-500">Manage routes, buses, students, and staff for your school.</p>
          </Card>
        </a>
      </div>
    </main>
  );
}
