import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/roles";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const client = await createClient();
  if (code && client) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user && !isAdmin(data.user))
      return NextResponse.redirect(new URL("/profile", url.origin));
    if (isAdmin(data.user)) await client.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(
    new URL("/login?confirmation=failed", url.origin),
  );
}
