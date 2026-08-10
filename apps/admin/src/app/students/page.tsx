"use client";

import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card } from "@tripme/ui";
import { adminQueries, useSupabaseClient } from "@tripme/supabase";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  qr_token: string;
  default_route_id: string | null;
  default_stop_id: string | null;
  guardian_student_links: { guardian_id: string; profiles: { full_name: string } | null }[];
}

interface OptionRow {
  id: string;
  name: string;
}

interface StopOption {
  id: string;
  name: string;
  route_id: string;
}

interface GuardianOption {
  id: string;
  full_name: string;
}

export default function StudentsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [routes, setRoutes] = useState<OptionRow[]>([]);
  const [stops, setStops] = useState<StopOption[]>([]);
  const [guardians, setGuardians] = useState<GuardianOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [guardianId, setGuardianId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function refetch() {
    if (!profile?.school_id) return;
    const studentData = await adminQueries.getSchoolStudents(supabase, profile.school_id);
    setStudents(studentData as unknown as StudentRow[]);
    const { data: routeRows } = await supabase.from("routes").select("id, name").eq("school_id", profile.school_id);
    setRoutes(routeRows ?? []);
    const { data: stopRows } = await supabase.from("stops").select("id, name, route_id").eq("school_id", profile.school_id);
    setStops(stopRows ?? []);
    const { data: guardianRows } = await supabase.from("profiles").select("id, full_name").eq("school_id", profile.school_id).eq("role", "parent");
    setGuardians(guardianRows ?? []);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminQueries.createStudent(supabase, {
        school_id: profile.school_id,
        first_name: firstName,
        last_name: lastName,
        grade: grade || undefined,
        default_route_id: routeId || null,
        default_stop_id: stopId || null
      });
      setFirstName("");
      setLastName("");
      setGrade("");
      setRouteId("");
      setStopId("");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create student");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLinkGuardian(studentId: string) {
    const selected = guardianId[studentId];
    if (!selected) return;
    await adminQueries.linkGuardianToStudent(supabase, selected, studentId);
    await refetch();
  }

  const stopsForRoute = stops.filter((s) => s.route_id === routeId);

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Students</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="mb-2 font-medium">New student</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              required
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              required
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Grade"
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
            <select
              value={routeId}
              onChange={(e) => {
                setRouteId(e.target.value);
                setStopId("");
              }}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              value={stopId}
              onChange={(e) => setStopId(e.target.value)}
              disabled={!routeId}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign stop…</option>
              {stopsForRoute.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {error ? <p className="text-sm text-critical-600">{error}</p> : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Add student"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-2">
          {students.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {s.first_name} {s.last_name} {s.grade ? `· Grade ${s.grade}` : ""}
                  </p>
                  <p className="text-sm text-neutral-500">
                    Guardians: {s.guardian_student_links.map((l) => l.profiles?.full_name).filter(Boolean).join(", ") || "none"}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                  {expandedId === s.id ? "Hide" : "Manage"}
                </Button>
              </div>
              {expandedId === s.id ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3 sm:flex-row sm:items-start">
                  <div className="flex flex-col items-center gap-1">
                    <QRCodeSVG value={s.qr_token} size={96} />
                    <span className="text-xs text-neutral-500">Boarding QR code</span>
                  </div>
                  <div className="flex flex-1 gap-2">
                    <select
                      value={guardianId[s.id] ?? ""}
                      onChange={(e) => setGuardianId((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">Link guardian…</option>
                      {guardians.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.full_name}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => handleLinkGuardian(s.id)}>Link</Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
          {students.length === 0 ? <p className="text-neutral-500">No students yet.</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
