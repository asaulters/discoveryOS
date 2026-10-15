import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMeetingExport } from "@/lib/services/meetingExportBuilder";
import type { EvidenceType } from "@/lib/types/database";
import { ConfidenceBadge, LockedBadge, VerifiedBadge } from "../WorkflowBadges";
import { EvidenceBadge } from "../live/EvidenceDrawer";

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(isoString: string) {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BUILD_DIRECTION_LABELS: Record<string, string> = {
  supported: "Supported",
  partially_supported: "Partially supported",
  weakened: "Weakened",
  needs_reframing: "Needs reframing",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-4 print:border-0 print:p-0 print:shadow-none dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-400">{children}</p>;
}

function EvidenceLine({
  evidenceType,
  confidenceLevel,
  humanVerified,
  lockedByUser,
}: {
  evidenceType: EvidenceType;
  confidenceLevel?: string;
  humanVerified: boolean;
  lockedByUser: boolean;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <EvidenceBadge evidenceType={evidenceType} />
      {confidenceLevel && <ConfidenceBadge level={confidenceLevel} />}
      {humanVerified && <VerifiedBadge />}
      {lockedByUser && <LockedBadge />}
    </div>
  );
}

export default async function MeetingSharePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const model = await buildMeetingExport(meetingId);

  if (!model) {
    notFound();
  }

  const metaParts = [model.meeting.meetingType];
  if (model.meeting.discoveryStrategy) metaParts.push(model.meeting.discoveryStrategy);
  if (model.meeting.company) metaParts.push(model.meeting.company);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-10 print:max-w-none">
      <header className="print:hidden">
        <div className="flex gap-4 text-sm">
          <Link href={`/meetings/${meetingId}/review`} className="text-blue-600 hover:underline dark:text-blue-400">
            ← Back to review
          </Link>
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
            Dashboard
          </Link>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Read-only shareable/print view - no edit controls, no live capture. Not publicly
          accessible; anyone with this link and app access can view it.
        </p>
      </header>

      <div className="rounded border border-neutral-200 bg-white p-4 print:border-0 print:p-0 dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold">{model.meeting.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {metaParts.join(" · ")} — {formatDate(model.meeting.date)}
        </p>
        {model.meeting.scenarioName && (
          <p className="text-sm text-neutral-500">Scenario: {model.meeting.scenarioName}</p>
        )}
        {model.meeting.goal && <p className="mt-2 text-sm">{model.meeting.goal}</p>}
        <p className="mt-2 text-xs text-neutral-400">Generated {formatDateTime(model.generatedAt)}</p>
      </div>

      <Section title="Executive Summary">
        {model.executiveSummary ? (
          <p className="whitespace-pre-wrap text-sm">{model.executiveSummary}</p>
        ) : (
          <EmptyNote>No post-meeting review has been generated yet.</EmptyNote>
        )}
        {model.knownFacts.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Known facts</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {model.knownFacts.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          </div>
        )}
        {model.inferences.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Inferences (not confirmed)
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {model.inferences.map((inference, i) => (
                <li key={i}>{inference}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {model.buildDirectionAssessment && (
        <Section title="Build Direction Assessment">
          <p className="text-xs font-medium text-neutral-500">
            Status: {BUILD_DIRECTION_LABELS[model.buildDirectionAssessment.status] ?? model.buildDirectionAssessment.status}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{model.buildDirectionAssessment.assessment}</p>
          {model.buildDirectionAssessment.recommendedReframe && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Recommended reframe: {model.buildDirectionAssessment.recommendedReframe}
            </p>
          )}
        </Section>
      )}

      <Section title="Process So Far">
        {model.processSummary && <p className="text-sm">{model.processSummary}</p>}
        {model.processSteps.length > 0 ? (
          <ol className="mt-2 space-y-2">
            {model.processSteps.map((step, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">
                  {i + 1}. {step.title}
                </span>
                {step.description && <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{step.description}</p>}
                <EvidenceLine
                  evidenceType={step.evidenceType}
                  confidenceLevel={step.confidenceLevel}
                  humanVerified={step.humanVerified}
                  lockedByUser={step.lockedByUser}
                />
              </li>
            ))}
          </ol>
        ) : (
          !model.processSummary && <EmptyNote>No process steps captured yet.</EmptyNote>
        )}
      </Section>

      <Section title="People, Teams, and Systems">
        {model.peopleAndSystems.length > 0 ? (
          <ul className="space-y-2">
            {model.peopleAndSystems.map((item, i) => (
              <li key={i} className="text-sm">
                <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                  {item.componentType}
                </span>{" "}
                <span className="font-medium">{item.label}</span>
                {item.description && <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{item.description}</p>}
                <EvidenceLine
                  evidenceType={item.evidenceType}
                  confidenceLevel={item.confidenceLevel}
                  humanVerified={item.humanVerified}
                  lockedByUser={item.lockedByUser}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>None identified yet.</EmptyNote>
        )}
      </Section>

      <Section title="Still Unclear">
        {model.stillUnclear.length > 0 || model.reviewOpenQuestions.length > 0 ? (
          <div className="space-y-3">
            {model.stillUnclear.map((gap, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{gap.label}</span>
                {gap.description && <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{gap.description}</p>}
                <EvidenceLine
                  evidenceType={gap.evidenceType}
                  humanVerified={gap.humanVerified}
                  lockedByUser={gap.lockedByUser}
                />
              </div>
            ))}
            {model.reviewOpenQuestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  From the post-meeting review
                </p>
                <ul className="mt-1 space-y-1.5">
                  {model.reviewOpenQuestions.map((q, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{q.question}</span>
                      <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{q.whyItMatters}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <EmptyNote>No open gaps yet.</EmptyNote>
        )}
      </Section>

      <Section title="Needs Clarification">
        {model.needsClarification.length > 0 ? (
          <ul className="space-y-2">
            {model.needsClarification.map((flag, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{flag.label}</span>
                <span className="ml-2 text-xs capitalize text-neutral-400">
                  {flag.ambiguityType} · {flag.priority} priority
                </span>
                {flag.description && <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{flag.description}</p>}
                {flag.sourceQuote && (
                  <p className="mt-0.5 italic text-neutral-500">&ldquo;{flag.sourceQuote}&rdquo;</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No clarification needs found yet.</EmptyNote>
        )}
      </Section>

      <Section title="Possible Mismatches">
        {model.possibleMismatches.length > 0 ? (
          <ul className="space-y-3">
            {model.possibleMismatches.map((mismatch, i) => (
              <li key={i} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{mismatch.label}</span>
                  <span className="text-xs capitalize text-neutral-400">
                    {mismatch.contradictionType} · {mismatch.severity} severity
                  </span>
                </div>
                <p className="mt-1 text-neutral-600 dark:text-neutral-400">{mismatch.description}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800">
                    <p className="font-semibold uppercase tracking-wide text-neutral-400">Claim A</p>
                    <p className="mt-0.5">{mismatch.claimA}</p>
                    {mismatch.quoteA && <p className="mt-0.5 italic text-neutral-500">&ldquo;{mismatch.quoteA}&rdquo;</p>}
                  </div>
                  <div className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800">
                    <p className="font-semibold uppercase tracking-wide text-neutral-400">Claim B</p>
                    <p className="mt-0.5">{mismatch.claimB}</p>
                    {mismatch.quoteB && <p className="mt-0.5 italic text-neutral-500">&ldquo;{mismatch.quoteB}&rdquo;</p>}
                  </div>
                </div>
                {mismatch.suggestedQuestion && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Suggested question: {mismatch.suggestedQuestion}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No evidence-backed mismatches found yet.</EmptyNote>
        )}
      </Section>

      <Section title="Recommended Follow-Ups">
        {model.recommendedFollowups.length > 0 ? (
          <ul className="space-y-2">
            {model.recommendedFollowups.map((followup, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{followup.topic}</span>
                <span className="ml-2 text-xs capitalize text-neutral-400">{followup.priority} priority</span>
                <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{followup.question}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>None yet.</EmptyNote>
        )}
      </Section>

      {model.evidenceHighlights.length > 0 && (
        <Section title="Evidence Highlights">
          <ul className="space-y-1.5">
            {model.evidenceHighlights.map((highlight, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{highlight.label}:</span>{" "}
                <span className="italic text-neutral-600 dark:text-neutral-400">&ldquo;{highlight.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Notes on Certainty">
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
          {model.knownLimitations.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
