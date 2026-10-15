import { requestOrigin } from "@/lib/requestOrigin";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) return NextResponse.json({ error: "Unable to sign out" }, { status: 500 });
  return NextResponse.redirect(new URL("/login", requestOrigin(request)), 303);
}
