import NewMeetingForm from "./NewMeetingForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const db = await createServerSupabaseClient();
  const { data, error } = await db
    .from("projects")
    .select("id,name,requesting_team,goal")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (
    <NewMeetingForm projects={data || []} initialProjectId={projectId || ""} />
  );
}
