/**
 * Seeds one demo school with a route, stops, a bus, students, guardian
 * links, and one auth account per role (admin/driver/parent x2).
 *
 * Auth users are created via the Admin API (not raw SQL against auth.users)
 * so Supabase's own password-hashing/identity bookkeeping stays correct; the
 * `handle_new_user` trigger (0003_rls_policies.sql) turns each into a
 * `profiles` row from the metadata passed here.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local at the
 * repo root. Run with `pnpm db:seed`.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = "TripmeDemo123!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local at repo root.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// A short, walkable-looking route around downtown Austin, TX — just needs to
// be a real-ish place so OpenStreetMap tiles render something recognizable.
const ROUTE_POINTS = [
  { lat: 30.2711, lng: -97.7437 },
  { lat: 30.2699, lng: -97.7409 },
  { lat: 30.2683, lng: -97.7385 },
  { lat: 30.2661, lng: -97.7368 },
  { lat: 30.2639, lng: -97.7351 },
  { lat: 30.2611, lng: -97.7339 }
];

const STOPS = [
  { name: "Maple Street", sequence_no: 1, lat: 30.2711, lng: -97.7437, scheduled_time: "07:30" },
  { name: "Oak Avenue", sequence_no: 2, lat: 30.2683, lng: -97.7385, scheduled_time: "07:40" },
  { name: "Cedar Court", sequence_no: 3, lat: 30.2611, lng: -97.7339, scheduled_time: "07:55" }
];

async function createUser(email: string, fullName: string, role: string, schoolId: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role, school_id: schoolId }
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  if (!data.user) throw new Error(`createUser(${email}) returned no user`);
  return data.user.id;
}

async function main() {
  console.log("Seeding Tripme demo data...");

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .insert({
      name: "Riverside Elementary",
      timezone: "America/Chicago",
      geofence_lat: ROUTE_POINTS[0]!.lat,
      geofence_lng: ROUTE_POINTS[0]!.lng,
      geofence_radius_m: 400
    })
    .select()
    .single();
  if (schoolError || !school) throw new Error(`school insert failed: ${schoolError?.message}`);
  console.log(`  school: ${school.id}`);

  const adminId = await createUser("admin@tripme.dev", "Ada Admin", "admin", school.id);
  const driverId = await createUser("driver@tripme.dev", "Dana Driver", "driver", school.id);
  const parent1Id = await createUser("parent1@tripme.dev", "Priya Parent", "parent", school.id);
  const parent2Id = await createUser("parent2@tripme.dev", "Pablo Parent", "parent", school.id);
  console.log(`  admin: ${adminId}, driver: ${driverId}, parent1: ${parent1Id}, parent2: ${parent2Id}`);

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .insert({ school_id: school.id, name: "Route 12 - Morning Pickup", direction: "pickup", polyline: ROUTE_POINTS })
    .select()
    .single();
  if (routeError || !route) throw new Error(`route insert failed: ${routeError?.message}`);
  console.log(`  route: ${route.id}`);

  const { data: stops, error: stopsError } = await supabase
    .from("stops")
    .insert(STOPS.map((s) => ({ ...s, route_id: route.id, school_id: school.id, radius_m: 150 })))
    .select();
  if (stopsError || !stops) throw new Error(`stops insert failed: ${stopsError?.message}`);
  console.log(`  stops: ${stops.map((s) => s.id).join(", ")}`);

  const { data: bus, error: busError } = await supabase
    .from("buses")
    .insert({
      school_id: school.id,
      label: "Bus 12",
      license_plate: "TRP-012",
      capacity: 40,
      driver_id: driverId,
      default_route_id: route.id,
      status: "inactive"
    })
    .select()
    .single();
  if (busError || !bus) throw new Error(`bus insert failed: ${busError?.message}`);
  console.log(`  bus: ${bus.id}`);

  const stopByName = Object.fromEntries(stops.map((s) => [s.name, s]));
  const studentsInput = [
    { first_name: "Ivy", last_name: "Nguyen", grade: "3", stopName: "Maple Street", guardianId: parent1Id },
    { first_name: "Owen", last_name: "Nguyen", grade: "5", stopName: "Oak Avenue", guardianId: parent1Id },
    { first_name: "Maya", last_name: "Torres", grade: "2", stopName: "Cedar Court", guardianId: parent2Id }
  ];

  for (const s of studentsInput) {
    const stop = stopByName[s.stopName];
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        school_id: school.id,
        first_name: s.first_name,
        last_name: s.last_name,
        grade: s.grade,
        default_route_id: route.id,
        default_stop_id: stop.id
      })
      .select()
      .single();
    if (studentError || !student) throw new Error(`student insert failed: ${studentError?.message}`);

    const { error: linkError } = await supabase.from("guardian_student_links").insert({
      guardian_id: s.guardianId,
      student_id: student.id,
      relationship: "parent",
      is_primary: true,
      is_authorized_pickup: true
    });
    if (linkError) throw new Error(`guardian link insert failed: ${linkError.message}`);

    console.log(`  student: ${s.first_name} ${s.last_name} (${student.id}) qr_token=${student.qr_token}`);
  }

  console.log("\nSeed complete. Demo logins (password for all: %s):", DEMO_PASSWORD);
  console.log("  admin@tripme.dev   (School Admin dashboard)");
  console.log("  driver@tripme.dev  (Driver flow, assigned to Bus 12)");
  console.log("  parent1@tripme.dev (guardian of Ivy + Owen Nguyen)");
  console.log("  parent2@tripme.dev (guardian of Maya Torres)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
