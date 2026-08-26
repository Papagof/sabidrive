import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createBus,
  createRoute,
  createSchool,
  createUser,
  deleteSchool,
  deleteUser,
  setProfileSchool,
  signIn,
  uniqueSuffix
} from "./helpers";

// Offline GPS queuing (apps/family/src/lib/useLiveLocationSharing.ts) replays
// queued fixes after reconnecting, and needs record_trip_location to backfill
// trip_locations.recorded_at to each fix's true original moment rather than
// replay time (0035_record_trip_location_timestamp.sql) -- otherwise a burst
// of replayed points would all land at ~now(), corrupting the trip's actual
// position history.
describe("record_trip_location: p_recorded_at backfill", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let driverToken: string;
  let tripId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`RecordedAt Test School ${suffix}`);
    const driverId = await createUser(`rat-driver-${suffix}@example.com`, password, { full_name: "RAT Driver", role: "driver" });
    userIds.push(driverId);
    await setProfileSchool(driverId, schoolId);

    const routeId = await createRoute(schoolId, "RecordedAt Test Route");
    const busId = await createBus(schoolId, "RecordedAt Test Bus", driverId, routeId);
    driverToken = await signIn(`rat-driver-${suffix}@example.com`, password);

    const startRes = await asUser(driverToken, "/rest/v1/rpc/start_trip", {
      method: "POST",
      body: JSON.stringify({ p_bus_id: busId, p_direction: "pickup" })
    });
    if (!startRes.ok) throw new Error(`start_trip failed: ${JSON.stringify(startRes.body)}`);
    tripId = startRes.body;
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("backfills recorded_at to the given p_recorded_at instead of now()", async () => {
    const originalMoment = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 minutes ago, simulating a replayed offline fix
    const res = await asUser(driverToken, "/rest/v1/rpc/record_trip_location", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_lat: 6.5, p_lng: 3.3, p_recorded_at: originalMoment })
    });
    expect(res.ok).toBe(true);

    const rows = await asUser(
      driverToken,
      `/rest/v1/trip_locations?trip_id=eq.${tripId}&select=recorded_at&order=recorded_at.asc&limit=1`
    );
    expect(rows.body).toHaveLength(1);
    expect(new Date(rows.body[0].recorded_at).getTime()).toBe(new Date(originalMoment).getTime());
  });

  it("defaults recorded_at to now() when p_recorded_at is omitted (the simulator's own calls never pass it)", async () => {
    const res = await asUser(driverToken, "/rest/v1/rpc/record_trip_location", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_lat: 6.51, p_lng: 3.31 })
    });
    expect(res.ok).toBe(true);

    const rows = await asUser(
      driverToken,
      `/rest/v1/trip_locations?trip_id=eq.${tripId}&select=recorded_at&order=recorded_at.desc&limit=1`
    );
    const recordedAtMs = new Date(rows.body[0].recorded_at).getTime();
    // A tight bound against a locally-captured Date.now() is flaky across
    // machines with clock skew (client vs the remote Postgres server) --
    // a generous tolerance is enough to prove this landed near "now" and
    // nowhere near the 5-minutes-ago value the previous test used.
    expect(Math.abs(recordedAtMs - Date.now())).toBeLessThan(15_000);
  });
});
