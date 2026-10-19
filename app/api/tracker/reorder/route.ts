import { trackerResponse } from "@/lib/tracker/api";
import { reorderTracker } from "@/lib/services/tracker";
export async function POST(request: Request) {
  return trackerResponse(async () => reorderTracker(await request.json()));
}
