import { NextResponse } from "next/server";
/** Privy auth is client-side; route protection lives in ProtectedShell. */
export default function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
