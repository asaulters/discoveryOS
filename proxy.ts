import { requestOrigin } from "@/lib/requestOrigin";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16's middleware convention is proxy.ts. No route/data extension
// exclusions: share pages, exports, API routes and RSC requests all pass here.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } },
  );
  const finish = (result: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Pragma", "no-cache");
    result.headers.set("Expires", "0");
    return result;
  };
  const pathname = request.nextUrl.pathname;
  const api = pathname === "/api" || pathname.startsWith("/api/");
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !error && !!data?.claims.sub;
  if (pathname === "/login") return finish(response);
  if (!signedIn) {
    return finish(api
      ? NextResponse.json({ error: "Sign in required" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", requestOrigin(request))));
  }
  // Reject cross-origin cookie-authenticated mutations, including sign-out.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== requestOrigin(request)) {
      return finish(NextResponse.json({ error: "Invalid origin" }, { status: 403 }));
    }
  }
  if (pathname === "/auth/signout") return finish(response);
  const { data: role, error: roleError } = await supabase.rpc("current_user_role");
  if (roleError || (role !== "owner" && role !== "viewer")) {
    return finish(NextResponse.json({ error: "Ask Adam to provision your profile" }, { status: 403 }));
  }
  if (api && !["GET", "HEAD", "OPTIONS"].includes(request.method) && role !== "owner") {
    return finish(NextResponse.json({ error: "Owner role required" }, { status: 403 }));
  }
  return finish(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
