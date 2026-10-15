import { NextRequest, NextResponse } from "next/server";
import { listFieldTests } from "@/lib/services/fieldTests";
import type { FieldTestStatus, FieldTestSuccessDecision } from "@/lib/types/database";

const STATUSES: FieldTestStatus[] = ["planned", "completed", "abandoned"];
const SUCCESS_DECISIONS: FieldTestSuccessDecision[] = [
  "strong_signal",
  "mixed_signal",
  "weak_signal",
  "not_enough_data",
];

/** Read-only listing across every meeting's field test - creation/updates always go through POST /api/meetings/[meetingId]/field-test. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const successDecision = params.get("successDecision");

  if (status && !STATUSES.includes(status as FieldTestStatus)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (successDecision && !SUCCESS_DECISIONS.includes(successDecision as FieldTestSuccessDecision)) {
    return NextResponse.json(
      { error: `successDecision must be one of: ${SUCCESS_DECISIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const fieldTests = await listFieldTests({
      status: (status as FieldTestStatus) ?? undefined,
      successDecision: (successDecision as FieldTestSuccessDecision) ?? undefined,
    });
    return NextResponse.json({ fieldTests });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load field tests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
