import { trackerResponse } from "@/lib/tracker/api";
import { changeProjectResource } from "@/lib/services/projectResources";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  return trackerResponse(async () => {
    const p = await params;
    return changeProjectResource(p.id, p.resourceId, await request.json());
  });
}
