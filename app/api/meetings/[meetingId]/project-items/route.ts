import { trackerResponse } from "@/lib/tracker/api";
import { getMeetingProjectItems } from "@/lib/services/meetingProject";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  return trackerResponse(async () =>
    getMeetingProjectItems((await params).meetingId),
  );
}
