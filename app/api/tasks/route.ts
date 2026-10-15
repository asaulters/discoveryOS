import { trackerResponse } from "@/lib/tracker/api";
import { mutateTracker } from "@/lib/services/tracker";

export async function POST(request: Request) {
  return trackerResponse(
    async () => mutateTracker("task", await request.json()),
    201,
  );
}
