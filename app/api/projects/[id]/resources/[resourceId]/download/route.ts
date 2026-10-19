import { trackerResponse } from "@/lib/tracker/api";
import { projectResourceDownload } from "@/lib/services/projectResources";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  return trackerResponse(async () => {
    const p = await params;
    return projectResourceDownload(p.id, p.resourceId);
  });
}
