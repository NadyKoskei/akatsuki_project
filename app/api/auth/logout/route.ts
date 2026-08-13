import { NextResponse, type NextRequest } from "next/server";
import { destroySession, getSession } from "@/lib/auth/session";
import { clearTokens } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signing out drops the session and the stored LOOP token set, so the next
 * visit has to go back through LOOP's authorize screen.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session) clearTokens(session.id);
  await destroySession();
  return NextResponse.redirect(new URL("/?signed_out=1", request.nextUrl.origin), { status: 303 });
}
