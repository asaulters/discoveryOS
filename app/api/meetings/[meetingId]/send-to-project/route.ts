import { trackerResponse } from "@/lib/tracker/api";
import { sendMeetingItems } from "@/lib/services/meetingProject";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  return trackerResponse(
    async () =>
      sendMeetingItems((await params).meetingId, await request.json()),
    201,
  );
}
