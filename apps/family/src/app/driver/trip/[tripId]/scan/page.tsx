"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { Button, Banner, Card } from "@sabidrive/ui";
import { studentQueries, tripQueries, userQueries, useSupabaseClient } from "@sabidrive/supabase";
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
  const [pendingPickup, setPendingPickup] = useState<{ qrToken: string; info: studentQueries.PickupInfo } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  async function submitCheckIn(qrToken: string) {
    setIsPaused(true);

    // Two-factor pickup authorization: on drop-off, look up who's allowed to
    // receive this child before actually recording the alight event.
    if (eventType === "alight") {
      try {
        const info = await studentQueries.getPickupInfo(supabase, qrToken);
        if (!info.student) {
          setStatus({ kind: "error", message: "Unrecognized student QR code" });
          setTimeout(() => setIsPaused(false), 1500);
          return;
        }
        setPendingPickup({ qrToken, info });
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : "Lookup failed" });
        setTimeout(() => setIsPaused(false), 1500);
      }
      return;
    }

    try {
      await tripQueries.checkIn(supabase, tripId, qrToken, eventType);
      setStatus({ kind: "success", message: `Checked in (${eventType}).` });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Check-in failed" });
    } finally {
      setTimeout(() => setIsPaused(false), 1500);
    }
  }

  async function handleConfirmDropoff() {
    if (!pendingPickup) return;
    setIsConfirming(true);
    try {
      await tripQueries.checkIn(supabase, tripId, pendingPickup.qrToken, "alight");
      setStatus({ kind: "success", message: "Drop-off recorded." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Check-in failed" });
    } finally {
      setIsConfirming(false);
      setPendingPickup(null);
      setIsPaused(false);
    }
  }

  function handleCancelPickup() {
    setPendingPickup(null);
    setIsPaused(false);
  }

  function handleScan(codes: IDetectedBarcode[]) {
    const value = codes[0]?.rawValue;
    if (value && !isPaused) void submitCheckIn(value);
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (manualToken.trim()) void submitCheckIn(manualToken.trim());
  }

  async function handleSmsCodeSubmit(e: FormEvent) {
    e.preventDefault();
    const code = smsCode.trim();
    if (!code) return;
    setIsVerifyingCode(true);
    setIsPaused(true);
    try {
      const result = await userQueries.verifyPickupCode(supabase, tripId, eventType, code);
      setStatus({
        kind: "success",
        message: `Checked in ${result.studentName} (${eventType})${result.guardianName ? ` — code from ${result.guardianName}` : ""}.`
      });
      setSmsCode("");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Invalid or expired code" });
    } finally {
      setIsVerifyingCode(false);
      setTimeout(() => setIsPaused(false), 1500);
    }
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

      {pendingPickup ? (
        <Card className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-neutral-500">Confirm pickup for</p>
            <p className="text-lg font-medium">
              {pendingPickup.info.student?.first_name} {pendingPickup.info.student?.last_name}
            </p>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Authorized guardians</p>
            {pendingPickup.info.authorizedGuardians.length > 0 ? (
              <ul className="text-sm text-neutral-600">
                {pendingPickup.info.authorizedGuardians.map((g, i) => (
                  <li key={i}>{g.full_name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">None on file.</p>
            )}
          </div>
          {pendingPickup.info.todaysOverrides.length > 0 ? (
            <Banner tone="caution" title="Authorized for today only">
              {pendingPickup.info.todaysOverrides.map((o, i) => (
                <div key={i}>
                  {o.authorized_name}
                  {o.authorized_relationship ? ` (${o.authorized_relationship})` : ""}
                  {o.notes ? ` — ${o.notes}` : ""}
                </div>
              ))}
            </Banner>
          ) : null}
          <p className="text-sm text-neutral-600">Verify the picking-up person matches one of the names above before confirming.</p>
          <div className="flex gap-2">
            <Button onClick={handleConfirmDropoff} disabled={isConfirming} className="flex-1">
              {isConfirming ? "Confirming..." : "Confirm identity & complete drop-off"}
            </Button>
            <Button variant="ghost" onClick={handleCancelPickup}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <>
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

          <Card>
            <form onSubmit={handleSmsCodeSubmit} className="flex flex-col gap-2">
              <label className="text-sm font-medium text-neutral-700">
                Home {eventType === "board" ? "pickup" : "drop-off"} — enter the parent&apos;s SMS code
              </label>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                  placeholder="123456"
                  className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
                />
                <Button type="submit" disabled={isVerifyingCode}>
                  {isVerifyingCode ? "Checking..." : "Check in"}
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}

      <Button variant="ghost" onClick={() => router.push(`/driver/trip/${tripId}`)}>
        Back to trip
      </Button>
    </main>
  );
}
