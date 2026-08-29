import { NextResponse, type NextRequest } from "next/server";

// Serves /start's content at the bare sabidrive.com domain's root, without
// touching family.sabidrive.com's own root (which keeps its normal
// session-based redirect to /login or a role home). Middleware runs on
// every request at the edge, before any static-page cache shortcut can
// serve "/" directly -- a plain vercel.json `has: host` rewrite doesn't
// reliably re-evaluate on cache hits for a statically-generated route,
// which is what caused this to intermittently miss.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host === "sabidrive.com") {
    return NextResponse.rewrite(new URL("/start", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/"
};
