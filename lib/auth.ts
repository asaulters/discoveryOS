import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const getAuth = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return { userId: null, role: null };
  const { data: role } = await supabase.rpc("current_user_role");
  return { userId: data.claims.sub, role: role === "owner" || role === "viewer" ? role : null };
});
