import { NextRequest, NextResponse } from "next/server";
import { createMeeting } from "@/lib/services/meetings";
import type { ConfidenceLevel, DiscoveryStrategy, MeetingType } from "@/lib/types/database";

const MEETING_TYPES: MeetingType[] = [
  "automation_discovery",
  "product_discovery",
  "technical_feasibility",
  "requirements_gathering",
  "business_case",
  "ux_research",
  "applied_ai_discovery",
];

const DISCOVERY_STRATEGIES: DiscoveryStrategy[] = [
  "broad_exploration",
  "deep_validation",
  "requirements_gathering",
  "technical_feasibility",
  "business_case",
];

interface CreateMeetingBody {
  name?: string;
  company?: string;
  meetingType?: string;
  discoveryStrategy?: string;
  goal?: string;
  currentUnderstanding?: string;
  tentativeBuildDirection?: string;
  risksUnknowns?: string[];
  assumptions?: { text: string; confidenceLevel?: ConfidenceLevel }[];
  pastedContext?: string;
  scenarioId?: string;
}

export async function POST(request: NextRequest) {
  let body: CreateMeetingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.meetingType?.trim()) {
    return NextResponse.json(
      { error: "name and meetingType are required" },
      { status: 400 }
    );
  }

  if (!MEETING_TYPES.includes(body.meetingType as MeetingType)) {
    return NextResponse.json(
      { error: `meetingType must be one of: ${MEETING_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (
    body.discoveryStrategy !== undefined &&
    !DISCOVERY_STRATEGIES.includes(body.discoveryStrategy as DiscoveryStrategy)
  ) {
    return NextResponse.json(
      { error: `discoveryStrategy must be one of: ${DISCOVERY_STRATEGIES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await createMeeting({
      name: body.name,
      company: body.company,
      meetingType: body.meetingType as MeetingType,
      discoveryStrategy: body.discoveryStrategy as DiscoveryStrategy | undefined,
      goal: body.goal,
      currentUnderstanding: body.currentUnderstanding,
      tentativeBuildDirection: body.tentativeBuildDirection,
      risksUnknowns: body.risksUnknowns,
      assumptions: body.assumptions,
      pastedContext: body.pastedContext,
      scenarioId: body.scenarioId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create meeting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
