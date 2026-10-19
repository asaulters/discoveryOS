import { trackerResponse } from "@/lib/tracker/api";
import {
  listProjectResources,
  addProjectResource,
} from "@/lib/services/projectResources";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return trackerResponse(async () => listProjectResources((await params).id));
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return trackerResponse(
    async () => addProjectResource((await params).id, await request.json()),
    201,
  );
}
