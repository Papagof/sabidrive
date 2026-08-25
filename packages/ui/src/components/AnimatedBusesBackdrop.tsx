// Purely decorative -- a slow drift of bus silhouettes behind a page with no
// live data of its own to show (the /start landing page, both apps' /login).
// Negative animation-delay pre-scatters each bus along its lane instead of
// bunching them all at the left edge on load. Relies on the `animate-bus-drive`
// keyframes + prefers-reduced-motion guard defined in each app's globals.css
// (Tailwind's per-app content scan means shared keyframes can't live here).
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

export function AnimatedBusesBackdrop() {
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
