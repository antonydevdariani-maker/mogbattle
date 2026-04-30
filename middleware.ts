import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Privy auth is client-side; route protection lives in ProtectedShell. */
export default function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
