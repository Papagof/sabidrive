"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { Button, Banner, Card } from "@tripme/ui";
import { tripQueries, useSupabaseClient } from "@tripme/supabase";
import { useRequireRole } from "@/lib/useRequireRole";

export default function ScanPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { isLoading: isAuthLoading } = useRequireRole(["driver"]);
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [eventType, setEventType] = useState<"board" | "alight">("board");
  const [manualToken, setManualToken] = useState("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  async function submitCheckIn(qrToken: string) {
    setIsPaused(true);
    try {
      await tripQueries.checkIn(supabase, tripId, qrToken, eventType);
      setStatus({ kind: "success", message: `Checked in (${eventType}).` });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Check-in failed" });
    } finally {
      setTimeout(() => setIsPaused(false), 1500);
    }
  }

  function handleScan(codes: IDetectedBarcode[]) {
    const value = codes[0]?.rawValue;
    if (value && !isPaused) void submitCheckIn(value);
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (manualToken.trim()) void submitCheckIn(manualToken.trim());
  }

  if (isAuthLoading) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold text-brand-800">Scan student</h1>

      <div className="flex gap-2">
        <Button
          variant={eventType === "board" ? "primary" : "secondary"}
          onClick={() => setEventType("board")}
          className="flex-1"
        >
          Boarding
        </Button>
        <Button
          variant={eventType === "alight" ? "primary" : "secondary"}
          onClick={() => setEventType("alight")}
          className="flex-1"
        >
          Drop-off
        </Button>
      </div>

      {status ? <Banner tone={status.kind === "success" ? "info" : "caution"} title={status.message} /> : null}

      <Card className="overflow-hidden p-0">
        <Scanner onScan={handleScan} paused={isPaused} />
      </Card>

      <Card>
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-neutral-700">No camera? Enter QR token manually</label>
          <div className="flex gap-2">
            <input
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="student qr_token"
              className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
            />
            <Button type="submit">Check in</Button>
          </div>
        </form>
      </Card>

      <Button variant="ghost" onClick={() => router.push(`/driver/trip/${tripId}`)}>
        Back to trip
      </Button>
    </main>
  );
}
