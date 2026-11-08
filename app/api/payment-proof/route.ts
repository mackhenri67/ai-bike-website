import { NextResponse } from "next/server";
import { getUser, getAdminUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/roles";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
};
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path || path.length > 600 || path.includes("..") || path.includes("://"))
    return NextResponse.json(
      { error: "Invalid proof path." },
      { status: 400, headers },
    );
  const [customer, admin] = await Promise.all([getUser(), getAdminUser()]);
  if (!customer && !isAdmin(admin))
    return NextResponse.json(
      { error: "Sign in to view this proof." },
      { status: 401, headers },
    );
  if (!isAdmin(admin) && path.split("/")[0] !== customer?.id)
    return NextResponse.json(
      { error: "Access denied." },
      { status: 403, headers },
    );
  const client = getAdminClient();
  if (!client)
    return NextResponse.json(
      { error: "Storage unavailable." },
      { status: 503, headers },
    );
  const { data, error } = await client.storage
    .from("payment-proofs")
    .download(path);
  if (error || !data)
    return NextResponse.json(
      { error: "Proof not found." },
      { status: 404, headers },
    );
  const type = data.type.split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp"].includes(type))
    return NextResponse.json(
      { error: "Unsupported proof image." },
      { status: 415, headers },
    );
  return new NextResponse(data.stream(), {
    headers: {
      ...headers,
      "Content-Type": type,
      "Content-Disposition": "inline; filename=payment-proof",
    },
  });
}
