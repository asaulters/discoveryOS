// Scenario data only; no hosted database or AI calls.
export async function seedDiscovery(db) {
  const meeting = (
    await db.query(
      "insert into meetings(name,meeting_type) values ('Tracker connection scenario','applied_ai_discovery') returning id",
    )
  ).rows[0].id;
  const project = (
    await db.query(
      "insert into projects(name,requesting_team,goal) values ('Discovery connection','Operations','Check the handoff') returning id",
    )
  ).rows[0].id;
  const review = (
    await db.query(
      `insert into post_meeting_reviews(meeting_id,recommended_followups,open_questions,risks,build_direction_assessment) values ($1,$2,$3,$4,$5) returning id`,
      [
        meeting,
        JSON.stringify([
          {
            topic: "Check approval ownership",
            question: "Who approves handoffs?",
            priority: "high",
          },
        ]),
        JSON.stringify([
          {
            question: "Who covers holidays?",
            whyItMatters: "Coverage is unclear",
            priority: "medium",
          },
        ]),
        JSON.stringify([
          {
            risk: "Approval delay",
            reason: "No backup owner",
            severity: "medium",
          },
        ]),
        JSON.stringify({
          status: "needs_reframing",
          assessment: "Validate the handoff first",
          recommendedReframe: "Start with the manual process",
        }),
      ],
    )
  ).rows[0].id;
  const workflow = (
    await db.query(
      "insert into workflows(meeting_id,name) values ($1,'Approval handoff') returning id",
      [meeting],
    )
  ).rows[0].id;
  const gap = (
    await db.query(
      "insert into workflow_gaps(workflow_id,label,normalized_label,description,source_quote,evidence_type) values ($1,'Backup owner','backup_owner','Clarify coverage','We wait when Sam is away','known') returning id",
      [workflow],
    )
  ).rows[0].id;
  const mismatch = (
    await db.query(
      "insert into contradiction_candidates(meeting_id,label,description,contradiction_type,claim_a,claim_b,source_quote_a,source_quote_b,suggested_clarification_question) values ($1,'Approval timing','Timing needs clarification','timing_conflict','Daily','Weekly','We approve daily','It waits until Friday','Which timing applies to urgent requests?') returning id",
      [meeting],
    )
  ).rows[0].id;
  const run = (
    await db.query(
      "insert into ai_run_logs(meeting_id,run_type,status,output) values ($1,'applied_ai_opportunity_assessment','succeeded',$2) returning id",
      [
        meeting,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          risks: [],
          missingInformation: [],
          suggestedNextQuestions: [],
          successMetricCandidates: [],
          patternFits: [],
          topRecommendedPatternIds: [],
          recommendationType: "no_build",
          confidence: "medium",
          reasoning: ["A manual handoff needs clarification first"],
          supportingEvidence: [
            { label: "Timing", quote: "It waits until Friday" },
          ],
          smallestUsefulExperiment: "Observe three manual approvals",
        }),
      ],
    )
  ).rows[0].id;
  return { meeting, project, review, gap, mismatch, run };
}
