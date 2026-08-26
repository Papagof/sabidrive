import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SUPABASE_DB_URL } from "./helpers";

/**
 * Regression test for the grant-lockdown gotcha CLAUDE.md documents as
 * having bitten this project multiple times (0006/0007/0013/0014/0017):
 * a newly created Postgres function defaults to a PUBLIC EXECUTE grant that
 * every role -- including anon -- inherits regardless of role-specific
 * revokes, unless `revoke ... from public` is issued explicitly.
 *
 * This can't be checked reliably by just calling the RPC as an anonymous
 * REST caller and asserting rejection: even with a leaked PUBLIC grant, the
 * function's own business-logic check (auth.uid() is null for an anon
 * caller) would *also* reject the call, for an unrelated reason, giving
 * false confidence. `has_function_privilege` is the only way to check the
 * grant itself rather than an accidentally-also-rejecting side effect --
 * same as CLAUDE.md's own documented verification query. This needs a
 * direct Postgres connection (SUPABASE_DB_URL), which is why it's a
 * separate file from the rest of the REST-only suite.
 */
const RPCS: { name: string; signature: string }[] = [
  { name: "start_trip", signature: "public.start_trip(uuid, text)" },
  { name: "check_in", signature: "public.check_in(uuid, uuid, text, text)" },
  { name: "trigger_sos", signature: "public.trigger_sos(uuid)" },
  {
    name: "record_trip_location",
    signature: "public.record_trip_location(uuid, double precision, double precision, numeric, numeric, numeric, jsonb, timestamptz)"
  },
  { name: "create_announcement", signature: "public.create_announcement(text, text)" }
];

const describeOrSkip = SUPABASE_DB_URL ? describe : describe.skip;

describeOrSkip("grant lockdown: SECURITY DEFINER RPCs are never left PUBLIC-executable", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it.each(RPCS)("$name: anon/public cannot execute, authenticated can", async ({ signature }) => {
    const res = await client.query(
      `select r.rolname, has_function_privilege(r.rolname, $1::regprocedure, 'EXECUTE') as can_execute
       from (values ('anon'), ('authenticated'), ('public')) as r(rolname)`,
      [signature]
    );
    const byRole = Object.fromEntries(res.rows.map((r) => [r.rolname, r.can_execute]));
    expect(byRole.anon).toBe(false);
    expect(byRole.public).toBe(false);
    expect(byRole.authenticated).toBe(true);
  });
});

if (!SUPABASE_DB_URL) {
  describe("grant lockdown", () => {
    it.skip("SUPABASE_DB_URL not set in .env.local -- skipping direct-connection grant checks", () => {});
  });
}
