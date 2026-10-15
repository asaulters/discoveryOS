import { getTracker } from "@/lib/services/tracker";
import ProjectsClient from "./ProjectsClient";
export default async function ProjectsPage() {
  return <ProjectsClient initial={await getTracker()} />;
}
