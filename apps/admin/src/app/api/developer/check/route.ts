import { NextResponse } from "next/server";
import { verifyDeveloperCaller } from "@/lib/developerAuth";

// Node runtime (not edge) -- needs the service-role key and the Admin API,
// same as every other developer-only Route Handler.
export const runtime = "nodejs";

/**
 * Lets AdminShell decide whether to show a "Developer" nav link, without
 * exposing that decision logic (the DEVELOPER_EMAILS allowlist) to the
 * client. Always 200 -- this isn't authorization-bearing, just a UI hint,
 * so it doesn't distinguish "no token" from "wrong email" the way the real
 * developer routes do. Every actual developer action still re-verifies via
 * verifyDeveloperCaller on its own route.
 */
export async function GET(req: Request) {
  const auth = await verifyDeveloperCaller(req);
  return NextResponse.json({ isDeveloper: auth.ok });
}
