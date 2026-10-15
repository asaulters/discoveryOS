import { notFound } from "next/navigation";
import { getTracker } from "@/lib/services/tracker";
import { getAuth } from "@/lib/auth";
import { entityId } from "@/lib/tracker/validation";
import ProjectClient from "./ProjectClient";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!entityId.safeParse(id).success) notFound();
  const [initial, auth] = await Promise.all([getTracker(id), getAuth()]);
  if (!initial.projects.length) notFound();
  return <ProjectClient key={id} initial={initial} userId={auth.userId!} />;
}
