import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ensureDefaultActiveThread,
  seedDefaultQueuedThreadsIfEmpty,
} from "@/lib/services/threads";
import { logUserAction } from "@/lib/services/userActions";
import type {
  Assumption,
  ConfidenceLevel,
  DiscoveryStrategy,
  Meeting,
  MeetingContextItem,
  MeetingType,
} from "@/lib/types/database";

export interface CreateMeetingInput {
  projectId?: string | null;
  name: string;
  company?: string | null;
  meetingType: MeetingType;
  discoveryStrategy?: DiscoveryStrategy | null;
  goal?: string | null;
  currentUnderstanding?: string | null;
  tentativeBuildDirection?: string | null;
  risksUnknowns?: string[];
  assumptions?: { text: string; confidenceLevel?: ConfidenceLevel }[];
  pastedContext?: string | null;
  scenarioId?: string | null;
}

export interface MeetingWithDetails {
  meeting: Meeting;
  assumptions: Assumption[];
  contextItems: MeetingContextItem[];
}

export async function createMeeting(
  input: CreateMeetingInput,
): Promise<MeetingWithDetails> {
  const supabase = await createServerSupabaseClient();

  if (input.projectId) {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .is("archived_at", null)
      .maybeSingle();
    if (error || !data) throw new Error("Choose an active project");
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .insert({
      name: input.name,
      project_id: input.projectId ?? null,
      company: input.company ?? null,
      meeting_type: input.meetingType,
      discovery_strategy: input.discoveryStrategy ?? null,
      goal: input.goal ?? null,
      current_understanding: input.currentUnderstanding ?? null,
      tentative_build_direction: input.tentativeBuildDirection ?? null,
      risks_unknowns: input.risksUnknowns ?? [],
      scenario_id: input.scenarioId ?? null,
      status: "prepared",
    })
    .select()
    .single();

  if (meetingError || !meeting) {
    throw new Error(`Failed to create meeting: ${meetingError?.message}`);
  }

  try {
    let assumptions: Assumption[] = [];
    const assumptionRows = (input.assumptions ?? []).filter((a) =>
      a.text.trim(),
    );
    if (assumptionRows.length > 0) {
      const { data, error } = await supabase
        .from("assumptions")
        .insert(
          assumptionRows.map((a) => ({
            meeting_id: meeting.id,
            text: a.text,
            confidence_level: a.confidenceLevel ?? "unclear",
          })),
        )
        .select();

      if (error) {
        throw new Error(`Failed to create assumptions: ${error.message}`);
      }
      assumptions = data ?? [];
    }

    let contextItems: MeetingContextItem[] = [];
    if (input.pastedContext && input.pastedContext.trim()) {
      const { data, error } = await supabase
        .from("meeting_context_items")
        .insert({
          meeting_id: meeting.id,
          content: input.pastedContext.trim(),
          source: "pasted",
        })
        .select();

      if (error) {
        throw new Error(`Failed to save pasted context: ${error.message}`);
      }
      contextItems = data ?? [];
    }

    await logUserAction(meeting.id, "meeting_created", {
      name: meeting.name,
      meeting_type: meeting.meeting_type,
    });

    return { meeting, assumptions, contextItems };
  } catch (err) {
    // Best-effort cleanup: Supabase JS has no cross-table transaction here.
    await supabase.from("meetings").delete().eq("id", meeting.id);
    throw err;
  }
}

export async function getMeetingWithDetails(
  meetingId: string,
): Promise<MeetingWithDetails | null> {
  const supabase = await createServerSupabaseClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    throw new Error(`Failed to load meeting: ${meetingError.message}`);
  }
  if (!meeting) {
    return null;
  }

  const [
    { data: assumptions, error: assumptionsError },
    { data: contextItems, error: contextError },
  ] = await Promise.all([
    supabase
      .from("assumptions")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true }),
    supabase
      .from("meeting_context_items")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true }),
  ]);

  if (assumptionsError) {
    throw new Error(`Failed to load assumptions: ${assumptionsError.message}`);
  }
  if (contextError) {
    throw new Error(`Failed to load context items: ${contextError.message}`);
  }

  return {
    meeting,
    assumptions: assumptions ?? [],
    contextItems: contextItems ?? [],
  };
}

/** Every meeting, newest-updated first, for the dashboard/meeting library (Sprint 7). No auth/ownership filter yet - this is a single-user prototype. */
export async function getAllMeetings(): Promise<Meeting[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load meetings: ${error.message}`);
  }

  return data ?? [];
}

export async function startMeeting(meetingId: string): Promise<Meeting> {
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load meeting: ${existingError.message}`);
  }
  if (!existing) {
    throw new Error("Meeting not found");
  }

  const { data: updated, error: updateError } = await supabase
    .from("meetings")
    .update({
      status: "live",
      started_at: existing.started_at ?? new Date().toISOString(),
    })
    .eq("id", meetingId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to start meeting: ${updateError?.message}`);
  }

  // Seeding the starter queue before ensuring an active thread lets the
  // existing "promote front of queue" logic pick a sensible thread as the
  // first active one, instead of falling back to a generic default.
  // meeting_type is now a canonical enum (set via dropdown), so this is a
  // plain equality check - no more free-text normalization needed.
  if (updated.meeting_type === "automation_discovery") {
    await seedDefaultQueuedThreadsIfEmpty(meetingId);
  }

  await ensureDefaultActiveThread(meetingId);
  await logUserAction(meetingId, "meeting_started");

  return updated;
}
