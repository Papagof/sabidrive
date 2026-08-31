"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Banner, Button, Card } from "@sabidrive/ui";
import {
  adminQueries,
  buildStudentImportPlan,
  buildStudentsCsv,
  parseCsv,
  userQueries,
  useSupabaseClient,
  type StudentExportRow,
  type StudentImportPlan
} from "@sabidrive/supabase";
import { InviteUserForm } from "@/components/InviteUserForm";

const CSV_TEMPLATE = "first_name,last_name,grade,route,stop\nJane,Doe,5,Route A,Elm St\n";

const INVITE_NEW_GUARDIAN = "__invite_new_guardian__";

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

interface PickupOverrideRow {
  id: string;
  authorized_name: string;
  authorized_relationship: string | null;
  notes: string | null;
  valid_date: string;
}

export default function StudentsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [routes, setRoutes] = useState<OptionRow[]>([]);
  const [stops, setStops] = useState<StopOption[]>([]);
  const [guardians, setGuardians] = useState<GuardianOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [stopFilter, setStopFilter] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [guardianId, setGuardianId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [overrides, setOverrides] = useState<PickupOverrideRow[]>([]);
  const [overrideName, setOverrideName] = useState("");
  const [overrideRelationship, setOverrideRelationship] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [isInvitingGuardian, setIsInvitingGuardian] = useState(false);

  const [linkEmail, setLinkEmail] = useState("");
  const [linkStatus, setLinkStatus] = useState<{ tone: "info" | "caution"; message: string } | null>(null);
  const [isLinkingByEmail, setIsLinkingByEmail] = useState(false);

  const [importPlan, setImportPlan] = useState<StudentImportPlan | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

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

  async function handleCsvFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportSuccess(null);
    setImportFileError(null);
    setImportPlan(null);
    try {
      const text = await file.text();
      const csvRows = parseCsv(text);
      const plan = buildStudentImportPlan(csvRows, routes, stops);
      setImportFileName(file.name);
      setImportPlan(plan);
    } catch (err) {
      setImportFileError(err instanceof Error ? err.message : "Failed to read that file");
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sabidrive-students-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportStudents() {
    if (!importPlan || importPlan.valid.length === 0 || !profile?.school_id) return;
    setIsImporting(true);
    try {
      await adminQueries.createStudentsBulk(
        supabase,
        importPlan.valid.map((row) => ({ ...row, school_id: profile.school_id! }))
      );
      setImportSuccess(`Imported ${importPlan.valid.length} student${importPlan.valid.length === 1 ? "" : "s"}.`);
      setImportPlan(null);
      setImportFileName(null);
      await refetch();
    } catch (err) {
      setImportFileError(err instanceof Error ? err.message : "Failed to import students");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleLinkGuardian(studentId: string) {
    const selected = guardianId[studentId];
    if (!selected) return;
    await adminQueries.linkGuardianToStudent(supabase, selected, studentId);
    await refetch();
  }

  async function toggleExpanded(studentId: string) {
    if (expandedId === studentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(studentId);
    setOverrideName("");
    setOverrideRelationship("");
    setOverrideNotes("");
    setIsInvitingGuardian(false);
    setLinkEmail("");
    setLinkStatus(null);
    const rows = await adminQueries.getPickupOverrides(supabase, studentId);
    setOverrides(rows as unknown as PickupOverrideRow[]);
  }

  async function handleLinkGuardianByEmail(studentId: string) {
    const email = linkEmail.trim();
    if (!email) return;
    setIsLinkingByEmail(true);
    setLinkStatus(null);
    try {
      const result = await userQueries.findGuardianByEmail(supabase, email);
      if (!result.found || !result.id) {
        setLinkStatus({
          tone: "caution",
          message: "No existing account with that email — use “+ Invite new guardian…” above instead."
        });
        return;
      }
      await adminQueries.linkGuardianToStudent(supabase, result.id, studentId);
      setLinkStatus({ tone: "info", message: `Linked ${result.full_name} as a guardian of this student.` });
      setLinkEmail("");
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to link guardian";
      setLinkStatus(
        message.includes("duplicate key") || message.includes("already exists")
          ? { tone: "info", message: "Already linked as a guardian of this student." }
          : { tone: "caution", message }
      );
    } finally {
      setIsLinkingByEmail(false);
    }
  }

  async function handleGuardianInvited(studentId: string, userId: string) {
    setIsInvitingGuardian(false);
    await adminQueries.linkGuardianToStudent(supabase, userId, studentId);
    await refetch();
  }

  async function handleAddOverride(studentId: string) {
    if (!overrideName.trim() || !profile) return;
    await adminQueries.createPickupOverride(supabase, {
      student_id: studentId,
      authorized_name: overrideName.trim(),
      authorized_relationship: overrideRelationship || undefined,
      notes: overrideNotes || undefined,
      created_by: profile.id
    });
    setOverrideName("");
    setOverrideRelationship("");
    setOverrideNotes("");
    const rows = await adminQueries.getPickupOverrides(supabase, studentId);
    setOverrides(rows as unknown as PickupOverrideRow[]);
  }

  const stopsForRoute = stops.filter((s) => s.route_id === routeId);
  const stopsForFilterRoute = stops.filter((s) => s.route_id === routeFilter);

  const query = searchQuery.trim().toLowerCase();
  const hasActiveFilter = query.length > 0 || routeFilter.length > 0 || stopFilter.length > 0;
  const filteredStudents = students.filter((s) => {
    if (query.length > 0) {
      const studentName = `${s.first_name} ${s.last_name}`.toLowerCase();
      const guardianNames = s.guardian_student_links.map((l) => l.profiles?.full_name?.toLowerCase() ?? "");
      if (!studentName.includes(query) && !guardianNames.some((name) => name.includes(query))) return false;
    }
    if (routeFilter === "__unassigned__") {
      if (s.default_route_id != null) return false;
    } else if (routeFilter.length > 0 && s.default_route_id !== routeFilter) {
      return false;
    }
    if (stopFilter.length > 0 && s.default_stop_id !== stopFilter) return false;
    return true;
  });

  function handleExportCsv() {
    const rows: StudentExportRow[] = filteredStudents.map((s) => ({
      first_name: s.first_name,
      last_name: s.last_name,
      grade: s.grade,
      route_name: routes.find((r) => r.id === s.default_route_id)?.name ?? null,
      stop_name: stops.find((st) => st.id === s.default_stop_id)?.name ?? null,
      guardians: s.guardian_student_links.map((l) => l.profiles?.full_name).filter(Boolean).join("; ")
    }));
    const blob = new Blob([buildStudentsCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sabidrive-students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Students</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by student or parent name…"
          className="min-h-control w-full max-w-md rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
        />
        <select
          value={routeFilter}
          onChange={(e) => {
            setRouteFilter(e.target.value);
            setStopFilter("");
          }}
          className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
        >
          <option value="">All routes</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value="__unassigned__">Unassigned</option>
        </select>
        <select
          value={stopFilter}
          onChange={(e) => setStopFilter(e.target.value)}
          disabled={routeFilter.length === 0 || routeFilter === "__unassigned__"}
          className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
        >
          <option value="">All stops</option>
          {stopsForFilterRoute.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="md" onClick={handleExportCsv} disabled={filteredStudents.length === 0}>
          Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
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

        <Card className="flex flex-col gap-2">
          <h2 className="font-medium">Import CSV</h2>
          <p className="text-sm text-neutral-500">
            Columns: <code>first_name</code>, <code>last_name</code>, and optionally <code>grade</code>, <code>route</code>,{" "}
            <code>stop</code> (route/stop matched by name).
          </p>
          <Button type="button" variant="ghost" onClick={handleDownloadTemplate}>
            Download template
          </Button>
          <input
            type="file"
            accept=".csv"
            onChange={handleCsvFileSelected}
            className="min-h-control rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          {importFileError ? <p className="text-sm text-critical-600">{importFileError}</p> : null}
          {importPlan ? (
            <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3">
              <p className="text-sm text-neutral-700">
                {importFileName} — <span className="font-medium text-calm-700">{importPlan.valid.length} ready</span>
                {importPlan.errors.length > 0 ? (
                  <>
                    , <span className="font-medium text-caution-700">{importPlan.errors.length} with errors</span>
                  </>
                ) : null}
              </p>
              {importPlan.errors.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs text-neutral-500">
                  {importPlan.errors.map((e, idx) => (
                    <li key={idx}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button type="button" disabled={importPlan.valid.length === 0 || isImporting} onClick={handleImportStudents}>
                {isImporting ? "Importing..." : `Import ${importPlan.valid.length} student${importPlan.valid.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          ) : null}
          {importSuccess ? <p className="text-sm text-calm-700">{importSuccess}</p> : null}
        </Card>
        </div>

        <div className="flex flex-col gap-2">
          {filteredStudents.map((s) => (
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
                <Button variant="ghost" onClick={() => toggleExpanded(s.id)}>
                  {expandedId === s.id ? "Hide" : "Manage"}
                </Button>
              </div>
              {expandedId === s.id ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3 sm:flex-row sm:items-start">
                  <div className="flex flex-col items-center gap-1">
                    <QRCodeSVG value={s.qr_token} size={96} />
                    <span className="text-xs text-neutral-500">Boarding QR code</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex gap-2">
                      <select
                        value={isInvitingGuardian ? INVITE_NEW_GUARDIAN : guardianId[s.id] ?? ""}
                        onChange={(e) => {
                          if (e.target.value === INVITE_NEW_GUARDIAN) {
                            setIsInvitingGuardian(true);
                          } else {
                            setIsInvitingGuardian(false);
                            setGuardianId((prev) => ({ ...prev, [s.id]: e.target.value }));
                          }
                        }}
                        className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">Link guardian…</option>
                        {guardians.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.full_name}
                          </option>
                        ))}
                        <option value={INVITE_NEW_GUARDIAN}>+ Invite new guardian…</option>
                      </select>
                      {!isInvitingGuardian ? <Button onClick={() => handleLinkGuardian(s.id)}>Link</Button> : null}
                    </div>
                    {isInvitingGuardian ? (
                      <InviteUserForm
                        role="parent"
                        onCancel={() => setIsInvitingGuardian(false)}
                        onInvited={(user) => handleGuardianInvited(s.id, user.userId)}
                      />
                    ) : null}

                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-neutral-500">
                        Or link a guardian who already has an account at another school:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={linkEmail}
                          onChange={(e) => setLinkEmail(e.target.value)}
                          placeholder="Guardian's email"
                          className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                        />
                        <Button variant="secondary" disabled={isLinkingByEmail} onClick={() => handleLinkGuardianByEmail(s.id)}>
                          {isLinkingByEmail ? "Linking..." : "Find & link"}
                        </Button>
                      </div>
                      {linkStatus ? (
                        <Banner tone={linkStatus.tone} title={linkStatus.message} className="py-2 text-sm" />
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-neutral-200 p-3">
                      <p className="mb-2 text-sm font-medium">Pickup authorization</p>
                      {overrides.length > 0 ? (
                        <ul className="mb-2 flex flex-col gap-1 text-sm text-neutral-600">
                          {overrides.map((o) => (
                            <li key={o.id}>
                              {o.authorized_name}
                              {o.authorized_relationship ? ` (${o.authorized_relationship})` : ""} — {o.valid_date}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mb-2 text-sm text-neutral-500">No same-day pickup overrides.</p>
                      )}
                      <p className="mb-1 text-xs text-neutral-500">Authorize someone else to pick up today:</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={overrideName}
                          onChange={(e) => setOverrideName(e.target.value)}
                          placeholder="Name"
                          className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                        />
                        <input
                          value={overrideRelationship}
                          onChange={(e) => setOverrideRelationship(e.target.value)}
                          placeholder="Relationship"
                          className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                        />
                        <input
                          value={overrideNotes}
                          onChange={(e) => setOverrideNotes(e.target.value)}
                          placeholder="Notes"
                          className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                        />
                        <Button onClick={() => handleAddOverride(s.id)}>Add</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
          {students.length === 0 ? <p className="text-neutral-500">No students yet.</p> : null}
          {students.length > 0 && filteredStudents.length === 0 && hasActiveFilter ? (
            <p className="text-neutral-500">No students match the current search and filters.</p>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
