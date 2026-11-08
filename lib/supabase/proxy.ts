import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";
import { SESSION_COOKIES } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config) return response;
  const path = request.nextUrl.pathname;
  const adminArea = path === "/admin" || path.startsWith("/admin/");
  const client = createServerClient(config.url, config.anonKey, {
    cookieOptions: { name: SESSION_COOKIES[adminArea ? "admin" : "customer"] },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  const go = (url: URL) => {
    const result = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return result;
  };
  const authPage = path === "/admin/login" || path === "/admin/reset-password";
  if (adminArea && !authPage && !isAdmin(user)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return go(url);
  }
  if (path === "/admin/login" && isAdmin(user)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return go(url);
  }
  return response;
}
