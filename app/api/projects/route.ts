import { trackerResponse } from "@/lib/tracker/api";
import { mutateTracker, getTracker } from "@/lib/services/tracker";

export async function POST(request: Request) {
  return trackerResponse(
    async () => mutateTracker("project", await request.json()),
    201,
  );
}

export async function GET() {
  return trackerResponse(() => getTracker());
}
