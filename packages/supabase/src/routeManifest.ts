/**
 * Pure grouping logic for the driver's pre-trip route manifest
 * (apps/family/src/app/driver/page.tsx). Takes the already-fetched stops +
 * students for a route (see queries/trips.ts's getRouteManifest) and groups
 * students into their assigned stop, in stop order -- no Supabase client,
 * fully unit-testable. Same pure-function-file pattern as reports.ts /
 * tripHistory.ts / studentImport.ts.
 */

export interface ManifestStopRow {
  id: string;
  name: string;
  sequence_no: number;
  scheduled_time: string | null;
}

export interface ManifestStudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  default_stop_id: string | null;
}

export interface ManifestStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
}

export interface ManifestStop {
  stopId: string;
  name: string;
  sequenceNo: number;
  scheduledTime: string | null;
  students: ManifestStudent[];
}

export interface RouteManifest {
  stops: ManifestStop[];
  unassignedStudents: ManifestStudent[];
}

function toManifestStudent(s: ManifestStudentRow): ManifestStudent {
  return { id: s.id, firstName: s.first_name, lastName: s.last_name, grade: s.grade };
}

/** Groups students into their assigned stop, in stop order. Students with no default_stop_id,
 * or one that doesn't match any stop on this route (e.g. a stale assignment after the stop was
 * deleted), are surfaced honestly in unassignedStudents rather than silently dropped. */
export function buildRouteManifest(stops: ManifestStopRow[], students: ManifestStudentRow[]): RouteManifest {
  const stopIds = new Set(stops.map((s) => s.id));
  const studentsByStop = new Map<string, ManifestStudent[]>();
  const unassignedStudents: ManifestStudent[] = [];

  for (const student of students) {
    if (student.default_stop_id && stopIds.has(student.default_stop_id)) {
      const list = studentsByStop.get(student.default_stop_id) ?? [];
      list.push(toManifestStudent(student));
      studentsByStop.set(student.default_stop_id, list);
    } else {
      unassignedStudents.push(toManifestStudent(student));
    }
  }

  const orderedStops = [...stops]
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .map(
      (s): ManifestStop => ({
        stopId: s.id,
        name: s.name,
        sequenceNo: s.sequence_no,
        scheduledTime: s.scheduled_time,
        students: studentsByStop.get(s.id) ?? []
      })
    );

  return { stops: orderedStops, unassignedStudents };
}
