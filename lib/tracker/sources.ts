import type { Certainty } from "./types";
import type {
  PostMeetingReview,
  WorkflowGap,
  ContradictionCandidate,
} from "@/lib/types/database";
export interface SendSource {
  source_type: string;
  source_item_id: string;
  source_item_key: string | null;
  target: "task" | "package" | "raid";
  title: string;
  detail: string | null;
  evidence_quote: string | null;
  certainty: Certainty;
  kind?: "risk" | "issue" | "decision";
  recommendation_type?: string | null;
  confidence?: string | null;
  alreadyIn?: { id: string; name: string };
}
export const sourceKey = (
  s: Pick<SendSource, "source_type" | "source_item_id" | "source_item_key">,
) => `${s.source_type}:${s.source_item_id}:${s.source_item_key ?? ""}`;
export interface SourceInputs {
  review: PostMeetingReview | null;
  gaps: WorkflowGap[];
  mismatches: ContradictionCandidate[];
  assessment: { id: string; output: unknown } | null;
}
export function mapSources({
  review,
  gaps,
  mismatches,
  assessment,
}: SourceInputs): SendSource[] {
  const rows: SendSource[] = [];
  if (review) {
    review.recommended_followups.forEach((v, i) =>
      rows.push({
        source_type: "followup",
        source_item_id: review.id,
        source_item_key: `recommended_followups:${i}`,
        target: "task",
        title: v.topic,
        detail: v.question,
        evidence_quote: null,
        certainty: "unknown",
      }),
    );
    review.open_questions.forEach((v, i) =>
      rows.push({
        source_type: "open_question",
        source_item_id: review.id,
        source_item_key: `open_questions:${i}`,
        target: "task",
        title: v.question,
        detail: v.whyItMatters,
        evidence_quote: null,
        certainty: "unknown",
      }),
    );
    review.risks.forEach((v, i) =>
      rows.push({
        source_type: "risk",
        source_item_id: review.id,
        source_item_key: `risks:${i}`,
        target: "raid",
        kind: "risk",
        title: v.risk,
        detail: v.reason,
        evidence_quote: null,
        certainty: "inferred",
      }),
    );
    const build = review.build_direction_assessment;
    if (build?.assessment)
      rows.push({
        source_type: "recommendation",
        source_item_id: review.id,
        source_item_key: "build_direction",
        target: "raid",
        kind: "decision",
        title: `Build direction: ${build.status}`,
        detail: [build.assessment, build.recommendedReframe]
          .filter(Boolean)
          .join("\n"),
        evidence_quote: null,
        certainty: "inferred",
      });
  }
  gaps.forEach((g) =>
    rows.push({
      source_type: "workflow_gap",
      source_item_id: g.id,
      source_item_key: null,
      target: "task",
      title: g.label,
      detail: g.description,
      evidence_quote: g.source_quote,
      certainty: g.evidence_type,
    }),
  );
  mismatches.forEach((c) =>
    rows.push({
      source_type: "mismatch",
      source_item_id: c.id,
      source_item_key: null,
      target: "raid",
      kind: "issue",
      title: `Needs clarification: ${c.label}`,
      detail: [c.description, c.suggested_clarification_question]
        .filter(Boolean)
        .join("\n"),
      evidence_quote:
        [
          c.source_quote_a ? `A: ${c.source_quote_a}` : null,
          c.source_quote_b ? `B: ${c.source_quote_b}` : null,
        ]
          .filter(Boolean)
          .join("\n") || null,
      certainty: "inferred",
    }),
  );
  if (assessment?.output && typeof assessment.output === "object") {
    const a = assessment.output as {
      recommendationType?: string;
      confidence?: string;
      supportingEvidence?: { quote?: string | null }[];
      reasoning?: string[];
      smallestUsefulExperiment?: string;
    };
    const quote =
      (a.supportingEvidence ?? [])
        .map((e) => e.quote)
        .filter(Boolean)
        .join("\n") || null;
    if (a.recommendationType)
      rows.push({
        source_type: "recommendation",
        source_item_id: assessment.id,
        source_item_key: "applied_ai_recommendation",
        target: "raid",
        kind: "decision",
        title: a.recommendationType.replaceAll("_", " "),
        detail: (a.reasoning ?? []).join("\n"),
        evidence_quote: quote,
        certainty: "inferred",
        recommendation_type: a.recommendationType,
        confidence: a.confidence,
      });
    if (a.smallestUsefulExperiment?.trim())
      rows.push({
        source_type: "experiment",
        source_item_id: assessment.id,
        source_item_key: "smallest_useful_experiment",
        target: "package",
        title: a.smallestUsefulExperiment.slice(0, 500),
        detail: a.smallestUsefulExperiment,
        evidence_quote: quote,
        certainty: "inferred",
      });
  }
  return rows.filter((r) => r.title?.trim());
}
