import { trackerResponse } from "@/lib/tracker/api";
import { mutateTracker } from "@/lib/services/tracker";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return trackerResponse(async () =>
    mutateTracker("task", await request.json(), (await params).id),
  );
}
