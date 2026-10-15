import { trackerResponse } from "@/lib/tracker/api";
import { mutateTracker, getTracker } from "@/lib/services/tracker";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return trackerResponse(async () =>
    mutateTracker("project", await request.json(), (await params).id),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return trackerResponse(async () => getTracker((await params).id));
}
