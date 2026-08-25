"use client";

import { useEffect, useState } from "react";

// Purely decorative -- a stylized schematic street map with a few buses
// looping along its roads, behind a page with no live data of its own to
// show (the /start landing page, both apps' /login). Everything lives in
// one SVG coordinate space (roads + buses) so bus positions always line up
// with the drawn roads regardless of the container's aspect ratio -- an
// HTML-positioned bus overlaid on a separately-scaled map background would
// drift off the road on some screen sizes. Each road path extends past the
// viewBox edges so the animation's loop-reset (end of path -> start of
// path) happens off-screen instead of as a visible jump.
const ROADS: { id: string; d: string }[] = [
  { id: "sabidrive-road-a", d: "M -20 70 C 100 30 260 110 420 60" },
  { id: "sabidrive-road-b", d: "M -20 250 C 140 200 260 300 420 230" },
  { id: "sabidrive-road-c", d: "M 330 -20 C 280 140 380 260 320 420" },
  { id: "sabidrive-road-d", d: "M -20 360 C 120 330 260 400 420 350" }
];

const BUSES: { roadId: string; color: string; duration: string; begin: string; scale: number }[] = [
  { roadId: "sabidrive-road-a", color: "text-brand-300", duration: "22s", begin: "-3s", scale: 1 },
  { roadId: "sabidrive-road-b", color: "text-calm-300", duration: "28s", begin: "-14s", scale: 0.85 },
  { roadId: "sabidrive-road-c", color: "text-brand-200", duration: "26s", begin: "-9s", scale: 0.9 },
  { roadId: "sabidrive-road-d", color: "text-calm-200", duration: "32s", begin: "-20s", scale: 0.75 },
  { roadId: "sabidrive-road-a", color: "text-neutral-300", duration: "34s", begin: "-27s", scale: 0.7 }
];

const BLOCKS: { x: number; y: number; w: number; h: number; className: string }[] = [
  { x: 30, y: 130, w: 70, h: 60, className: "text-brand-50" },
  { x: 160, y: 30, w: 90, h: 50, className: "text-calm-50" },
  { x: 250, y: 150, w: 60, h: 70, className: "text-neutral-100" },
  { x: 40, y: 280, w: 80, h: 50, className: "text-calm-50" },
  { x: 190, y: 300, w: 100, h: 70, className: "text-brand-50" },
  { x: 300, y: 60, w: 55, h: 50, className: "text-neutral-100" }
];

export function AnimatedBusesBackdrop() {
  const [motionAllowed, setMotionAllowed] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotionAllowed(!query.matches);
    const handleChange = (e: MediaQueryListEvent) => setMotionAllowed(!e.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <symbol id="sabidrive-bus-icon" viewBox="0 0 64 32">
            <rect x="2" y="6" width="56" height="18" rx="4" fill="currentColor" />
            <rect x="2" y="6" width="56" height="7" rx="3" fill="currentColor" opacity="0.55" />
            <circle cx="16" cy="26" r="5" fill="currentColor" />
            <circle cx="48" cy="26" r="5" fill="currentColor" />
            <circle cx="16" cy="26" r="2" fill="#fff" opacity="0.9" />
            <circle cx="48" cy="26" r="2" fill="#fff" opacity="0.9" />
          </symbol>
        </defs>

        {BLOCKS.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} className={b.className} fill="currentColor" opacity={0.5} />
        ))}

        {ROADS.map((road) => (
          <g key={road.id} className="text-neutral-200">
            <path id={road.id} d={road.d} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
            <path d={road.d} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="6 6" opacity={0.7} />
          </g>
        ))}

        {motionAllowed
          ? BUSES.map((bus, i) => (
              <g key={i} className={bus.color}>
                <use
                  href={`#sabidrive-bus-icon`}
                  xlinkHref={`#sabidrive-bus-icon`}
                  x={-16 * bus.scale}
                  y={-8 * bus.scale}
                  width={32 * bus.scale}
                  height={16 * bus.scale}
                />
                <animateMotion dur={bus.duration} begin={bus.begin} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${bus.roadId}`} xlinkHref={`#${bus.roadId}`} />
                </animateMotion>
              </g>
            ))
          : null}
      </svg>
    </div>
  );
}
