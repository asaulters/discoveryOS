import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ConfidenceLevel,
  DiscoveryThread,
  QuestionDirection,
  ThreadPriority,
} from "@/lib/types/database";

const DEFAULT_THREAD_TITLE = "Workflow mapping";

export async function getActiveThread(
  meetingId: string
): Promise<DiscoveryThread | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active thread: ${error.message}`);
  }

  return data;
}

export async function getQueuedThreads(
  meetingId: string
): Promise<DiscoveryThread[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("in_queue", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load queued threads: ${error.message}`);
  }

  return data ?? [];
}

/** Every thread in the meeting regardless of status - for Sprint 15's conversation-state analyzer, which needs full context (including active/covered/dismissed) to avoid re-suggesting an already-tracked topic, and for its dedup matching against new topic signals. */
export async function getAllThreadsForMeeting(meetingId: string): Promise<DiscoveryThread[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load all threads: ${error.message}`);
  }

  return data ?? [];
}

export async function getDirectionsForThread(
  threadId: string
): Promise<QuestionDirection[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_directions")
    .select("*")
    .eq("discovery_thread_id", threadId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load question directions: ${error.message}`);
  }

  return data ?? [];
}

export async function getThreadById(threadId: string): Promise<DiscoveryThread | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load thread: ${error.message}`);
  }

  return data;
}

/**
 * Finds a non-active thread in this meeting whose title matches (case
 * insensitive), so deferring a direction can reuse an existing queued
 * thread instead of creating a duplicate.
 */
export async function findQueueableThreadByTitle(
  meetingId: string,
  title: string
): Promise<DiscoveryThread | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("meeting_id", meetingId)
    .neq("status", "active")
    .ilike("title", title)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up existing thread: ${error.message}`);
  }

  return data;
}

/** Any thread in this meeting matching the title, regardless of status - callers decide what to do based on status. */
export async function findThreadByTitle(
  meetingId: string,
  title: string
): Promise<DiscoveryThread | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("meeting_id", meetingId)
    .ilike("title", title)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up thread by title: ${error.message}`);
  }

  return data;
}

export async function getNextQueueSortOrder(meetingId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .select("sort_order")
    .eq("meeting_id", meetingId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to compute next queue position: ${error.message}`);
  }

  return data ? data.sort_order + 1 : 0;
}

interface DefaultThreadSeed {
  title: string;
  priority: ThreadPriority;
}

// "Workflow mapping" is listed first, at high priority, so it's both the
// queue's front position and the title ensureDefaultActiveThread's
// "prefer Workflow mapping" lookup will find - mapping the workflow is the
// natural entry point before drilling into decision rules, failure
// handling, etc. Without it in this hardcoded fallback list (used when no
// pre-meeting brief was generated), that lookup found nothing and silently
// fell back to whatever was first in sort order instead.
const DEFAULT_AUTOMATION_DISCOVERY_THREADS: DefaultThreadSeed[] = [
  { title: DEFAULT_THREAD_TITLE, priority: "high" },
  { title: "Decision rules", priority: "medium" },
  { title: "Failure handling", priority: "medium" },
  { title: "Data availability", priority: "medium" },
  { title: "Compliance approval", priority: "medium" },
  { title: "Success metrics", priority: "medium" },
];

/**
 * Seeds the standard automation-discovery starter queue the first time a
 * meeting of that type goes live. No-ops if the meeting already has any
 * threads, so calling /start more than once can't duplicate the queue.
 */
export async function seedDefaultQueuedThreadsIfEmpty(meetingId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { count, error: countError } = await supabase
    .from("discovery_threads")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meetingId);

  if (countError) {
    throw new Error(`Failed to check existing threads: ${countError.message}`);
  }

  if (count && count > 0) {
    return;
  }

  const { error: insertError } = await supabase.from("discovery_threads").insert(
    DEFAULT_AUTOMATION_DISCOVERY_THREADS.map((seed, index) => ({
      meeting_id: meetingId,
      title: seed.title,
      status: "open" as const,
      priority: seed.priority,
      in_queue: true,
      sort_order: index,
      locked_until_release: false,
      confidence_level: "unclear" as const,
    }))
  );

  if (insertError) {
    throw new Error(`Failed to seed default queued threads: ${insertError.message}`);
  }
}

/**
 * Guarantees a meeting has exactly one active discovery thread:
 * - Returns the existing active thread if present.
 * - Otherwise promotes the front of the queue to active.
 * - Otherwise creates a default active thread.
 */
export async function ensureDefaultActiveThread(
  meetingId: string
): Promise<DiscoveryThread> {
  const supabase = await createServerSupabaseClient();

  const existingActive = await getActiveThread(meetingId);
  if (existingActive) {
    return existingActive;
  }

  // Prefer a "Workflow mapping" thread as the starting point when one is
  // in the queue (e.g. seeded by the Setup Analyst) - mapping the workflow
  // first is the natural entry point before drilling into decision rules,
  // failure handling, etc. Otherwise fall back to the front of the queue.
  // Sprint 30: a "deferred" thread (see threadFocus.ts's deferThread) is
  // deliberately excluded from auto-promotion here - deferring only means
  // something the facilitator wants back in the backlog, not "pick this
  // again automatically the moment nothing else is active." It still
  // comes back the instant someone clicks Focus on it directly.
  const { data: workflowMappingThread, error: workflowMappingError } = await supabase
    .from("discovery_threads")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("in_queue", true)
    .neq("status", "deferred")
    .ilike("title", DEFAULT_THREAD_TITLE)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workflowMappingError) {
    throw new Error(`Failed to check thread queue: ${workflowMappingError.message}`);
  }

  const { data: queueFront, error: queueError } = workflowMappingThread
    ? { data: workflowMappingThread, error: null }
    : await supabase
        .from("discovery_threads")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("in_queue", true)
        .neq("status", "deferred")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

  if (queueError) {
    throw new Error(`Failed to check thread queue: ${queueError.message}`);
  }

  if (queueFront) {
    const { data: promoted, error: promoteError } = await supabase
      .from("discovery_threads")
      .update({ status: "active", in_queue: false })
      .eq("id", queueFront.id)
      .select()
      .single();

    if (promoteError) {
      throw new Error(`Failed to promote queued thread: ${promoteError.message}`);
    }

    return promoted;
  }

  const { data: created, error: createError } = await supabase
    .from("discovery_threads")
    .insert({
      meeting_id: meetingId,
      title: DEFAULT_THREAD_TITLE,
      status: "active",
      priority: "high",
      in_queue: false,
      sort_order: 0,
      locked_until_release: false,
      confidence_level: "unclear",
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create default active thread: ${createError.message}`);
  }

  return created;
}

export async function updateThreadConfidence(
  threadId: string,
  confidenceLevel: ConfidenceLevel
): Promise<DiscoveryThread> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .update({ confidence_level: confidenceLevel })
    .eq("id", threadId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update thread confidence: ${error?.message}`);
  }

  return data;
}

export async function updateThreadFields(
  threadId: string,
  patch: Partial<
    Pick<
      DiscoveryThread,
      "status" | "priority" | "in_queue" | "sort_order" | "locked_until_release" | "why_it_matters"
    >
  >
): Promise<DiscoveryThread> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("discovery_threads")
    .update(patch)
    .eq("id", threadId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update thread: ${error?.message}`);
  }

  return data;
}

export async function createQueuedThread(
  meetingId: string,
  title: string,
  whyItMatters: string | null,
  options?: { priority?: ThreadPriority; status?: DiscoveryThread["status"] }
): Promise<DiscoveryThread> {
  const supabase = await createServerSupabaseClient();
  const sortOrder = await getNextQueueSortOrder(meetingId);

  const { data, error } = await supabase
    .from("discovery_threads")
    .insert({
      meeting_id: meetingId,
      title,
      status: options?.status ?? "deferred",
      priority: options?.priority ?? "medium",
      in_queue: true,
      sort_order: sortOrder,
      locked_until_release: false,
      confidence_level: "unclear",
      why_it_matters: whyItMatters,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create queued thread: ${error?.message}`);
  }

  return data;
}

export interface InitialQueueDraft {
  title: string;
  priority: ThreadPriority;
  whyItMatters: string;
}

/**
 * Reconciles the Setup Analyst's proposed initial queue with what's already
 * in the meeting: matches by title, updates queued/open threads in place,
 * inserts anything new, and never deletes. Threads that are already active
 * or covered are left untouched - that's live, user-driven state the Setup
 * Analyst must not override.
 */
export async function reconcileInitialQueue(
  meetingId: string,
  drafts: InitialQueueDraft[]
): Promise<void> {
  for (const draft of drafts) {
    const existing = await findThreadByTitle(meetingId, draft.title);

    if (!existing) {
      await createQueuedThread(meetingId, draft.title, draft.whyItMatters, {
        priority: draft.priority,
        status: "open",
      });
      continue;
    }

    if (existing.status === "active" || existing.status === "covered") {
      continue;
    }

    await updateThreadFields(existing.id, {
      status: "open",
      in_queue: true,
      priority: draft.priority,
      why_it_matters: draft.whyItMatters,
    });
  }
}
