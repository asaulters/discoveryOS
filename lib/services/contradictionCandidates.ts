import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ContradictionCandidate, ContradictionSeverity, ContradictionType } from "@/lib/types/database";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((token) => token.length > 2)
  );
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  return shared / Math.min(a.size, b.size);
}

/** How similar two claim pairs must be (by token overlap) to count as "the same two claims" for duplicate suppression - mirrors workflows.ts's FUZZY_PROTECTED_MATCH_THRESHOLD. */
const SAME_CLAIMS_MATCH_THRESHOLD = 0.6;

function claimsText(claimA: string, claimB: string): string {
  return `${claimA} ${claimB}`;
}

export async function listContradictionCandidates(meetingId: string): Promise<ContradictionCandidate[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contradiction_candidates")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load contradiction candidates: ${error.message}`);
  }

  return data ?? [];
}

export interface ContradictionCandidateDraft {
  label: string;
  description: string;
  contradictionType: ContradictionType;
  severity: ContradictionSeverity;
  claimA: string;
  claimB: string;
  sourceTranscriptSegmentIdA: string | null;
  sourceTranscriptSegmentIdB: string | null;
  sourceQuoteA: string | null;
  sourceQuoteB: string | null;
  suggestedClarificationQuestion: string | null;
}

/**
 * Reconciles by normalized label + contradiction_type first (exact match,
 * same convention as ambiguity_flags/workflow_gaps), falling back to a
 * token-overlap match on the claim_a/claim_b pair within the same type when
 * the label doesn't match exactly - this is what stops the detector from
 * creating a near-duplicate candidate for "the same two claims" phrased
 * slightly differently across runs (see SAME_CLAIMS_MATCH_THRESHOLD).
 *
 * Once a candidate is resolved or dismissed, a later detector run never
 * rewrites its text or reopens it - same "human triage wins" guarantee as
 * every other reconcile* function in this app. This is a deliberately
 * conservative simplification of "unless there is clearly new evidence":
 * judging "clearly new" would require semantic reasoning this reconcile
 * layer doesn't do, so - like ambiguity_flags/workflow_gaps before it - the
 * facilitator's own resolution/dismissal is treated as final. A genuinely
 * new contradiction discovered later always gets its own new row instead
 * (it won't match this one by label or by claim overlap).
 */
export async function reconcileContradictionCandidates(
  meetingId: string,
  drafts: ContradictionCandidateDraft[]
): Promise<void> {
  if (drafts.length === 0) return;

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("contradiction_candidates")
    .select("*")
    .eq("meeting_id", meetingId);

  if (existingError) {
    throw new Error(`Failed to load existing contradiction candidates: ${existingError.message}`);
  }

  const rows = existing ?? [];
  const byExactKey = new Map(rows.map((r) => [`${r.contradiction_type}::${normalize(r.label)}`, r]));
  const byType = new Map<ContradictionType, ContradictionCandidate[]>();
  for (const row of rows) {
    const bucket = byType.get(row.contradiction_type) ?? [];
    bucket.push(row);
    byType.set(row.contradiction_type, bucket);
  }

  for (const draft of drafts) {
    const exactKey = `${draft.contradictionType}::${normalize(draft.label)}`;
    let match = byExactKey.get(exactKey);

    if (!match) {
      const draftClaimTokens = tokenize(claimsText(draft.claimA, draft.claimB));
      let best: { row: ContradictionCandidate; score: number } | null = null;
      for (const candidate of byType.get(draft.contradictionType) ?? []) {
        const score = tokenOverlapRatio(
          draftClaimTokens,
          tokenize(claimsText(candidate.claim_a, candidate.claim_b))
        );
        if (score >= SAME_CLAIMS_MATCH_THRESHOLD && (!best || score > best.score)) {
          best = { row: candidate, score };
        }
      }
      if (best) {
        match = best.row;
        console.info(
          `[contradiction-reconcile] matched draft "${draft.label}" to existing candidate "${best.row.label}" by claim overlap (id=${best.row.id}, score=${best.score.toFixed(2)}) - treated as the same underlying tension, not a new duplicate`
        );
      }
    }

    if (match) {
      if (match.status !== "open") continue;

      const { error } = await supabase
        .from("contradiction_candidates")
        .update({
          label: draft.label,
          description: draft.description,
          severity: draft.severity,
          claim_a: draft.claimA,
          claim_b: draft.claimB,
          source_transcript_segment_id_a: draft.sourceTranscriptSegmentIdA,
          source_transcript_segment_id_b: draft.sourceTranscriptSegmentIdB,
          source_quote_a: draft.sourceQuoteA,
          source_quote_b: draft.sourceQuoteB,
          suggested_clarification_question: draft.suggestedClarificationQuestion,
        })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update contradiction candidate: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from("contradiction_candidates").insert({
      meeting_id: meetingId,
      label: draft.label,
      description: draft.description,
      contradiction_type: draft.contradictionType,
      severity: draft.severity,
      claim_a: draft.claimA,
      claim_b: draft.claimB,
      source_transcript_segment_id_a: draft.sourceTranscriptSegmentIdA,
      source_transcript_segment_id_b: draft.sourceTranscriptSegmentIdB,
      source_quote_a: draft.sourceQuoteA,
      source_quote_b: draft.sourceQuoteB,
      suggested_clarification_question: draft.suggestedClarificationQuestion,
    });

    if (error) {
      throw new Error(`Failed to create contradiction candidate: ${error.message}`);
    }
  }
}

export async function getContradictionCandidateWithMeeting(
  candidateId: string
): Promise<{ candidate: ContradictionCandidate; meetingId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contradiction_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load contradiction candidate: ${error.message}`);
  }
  if (!data) return null;

  return { candidate: data, meetingId: data.meeting_id };
}

async function setContradictionStatus(
  candidateId: string,
  status: "open" | "resolved" | "dismissed",
  resolutionNote?: string | null
): Promise<ContradictionCandidate> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contradiction_candidates")
    .update({
      status,
      ...(resolutionNote !== undefined ? { resolution_note: resolutionNote } : {}),
    })
    .eq("id", candidateId)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update contradiction candidate: ${error.message}`);
  }
  if (!data) throw new Error("Contradiction candidate not found");

  return data;
}

/** The facilitator has since clarified this point - resolves it (keeping any resolution note) without deleting the record of what looked like tension. */
export async function markContradictionResolved(
  candidateId: string,
  resolutionNote?: string | null
): Promise<ContradictionCandidate> {
  return setContradictionStatus(candidateId, "resolved", resolutionNote ?? null);
}

/** The facilitator has decided this isn't worth pursuing - sets it aside without deleting it. */
export async function dismissContradictionCandidate(
  candidateId: string,
  resolutionNote?: string | null
): Promise<ContradictionCandidate> {
  return setContradictionStatus(candidateId, "dismissed", resolutionNote ?? null);
}

/** Reopens a resolved/dismissed candidate - e.g. the facilitator realizes the clarification didn't actually hold. Clears the resolution note since it no longer applies. */
export async function reopenContradictionCandidate(candidateId: string): Promise<ContradictionCandidate> {
  return setContradictionStatus(candidateId, "open", null);
}
