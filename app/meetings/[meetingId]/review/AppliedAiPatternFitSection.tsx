import type { PatternFitLevel, PatternFitResult } from "@/lib/patterns/patternFit";

const FIT_LEVEL_STYLES: Record<PatternFitLevel, string> = {
  strong: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
  possible: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400",
  weak: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  not_enough_info: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
  not_fit: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
};

const FIT_LEVEL_LABELS: Record<PatternFitLevel, string> = {
  strong: "Strong fit",
  possible: "Possible fit",
  weak: "Weak fit",
  not_enough_info: "Not enough info",
  not_fit: "Not a fit",
};

/** Sprint 26 Part D: the exact UX-clarity requirement from the brief - each fit level's badge is paired with what it actually means, so "strong" is never read as "build now." */
const FIT_LEVEL_MEANINGS: Record<PatternFitLevel, string> = {
  strong: "Well-evidenced - still worth validating before committing to a build, not a green light to build immediately.",
  possible: "Worth validating - plausible given what's known, but not yet confirmed.",
  weak: "Thin support - more discovery needed before this is a real candidate.",
  not_enough_info: "Ask more before recommending - too little evidence yet to judge this pattern either way.",
  not_fit: "Avoid this pattern for now - the evidence actively points away from it.",
};

function FitLevelBadge({ level }: { level: PatternFitLevel }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FIT_LEVEL_STYLES[level]}`}>
      {FIT_LEVEL_LABELS[level]}
    </span>
  );
}

function PatternFitCard({ fit }: { fit: PatternFitResult }) {
  return (
    <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{fit.patternName}</span>
        <FitLevelBadge level={fit.fitLevel} />
      </div>
      <p className="mt-1 text-xs italic text-neutral-500">{FIT_LEVEL_MEANINGS[fit.fitLevel]}</p>

      {fit.supportingSignals.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Why it fits</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm">
            {fit.supportingSignals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {fit.missingEvidence.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Missing evidence</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            {fit.missingEvidence.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {fit.whyNotYet.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Why not yet</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            {fit.whyNotYet.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {fit.risks.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Risks</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            {fit.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {fit.saferFirstVersion && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Safer first version</p>
          <p className="mt-0.5 text-sm">{fit.saferFirstVersion}</p>
        </div>
      )}

      {fit.suggestedValidationQuestions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Validation questions</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm">
            {fit.suggestedValidationQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AppliedAiPatternFitSection({
  patternFits,
  topRecommendedPatternIds,
}: {
  patternFits: PatternFitResult[];
  topRecommendedPatternIds: string[];
}) {
  const topFits = topRecommendedPatternIds
    .map((id) => patternFits.find((f) => f.patternId === id))
    .filter((f): f is PatternFitResult => !!f);
  const remainingFits = patternFits.filter((f) => !topRecommendedPatternIds.includes(f.patternId));

  return (
    <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Applied AI pattern fit</h3>
      <p className="mt-1 text-xs text-neutral-500">
        Deterministic, evidence-based pattern matching - not a final architecture. A &ldquo;strong fit&rdquo; still
        needs validating before building; &ldquo;not enough info&rdquo; means ask more before recommending.
      </p>

      {topFits.length > 0 ? (
        <div className="mt-3 space-y-3">
          {topFits.map((fit) => (
            <PatternFitCard key={fit.patternId} fit={fit} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">
          No pattern has reached at least a possible fit yet - see the full results below for what&apos;s closest and
          what&apos;s still missing.
        </p>
      )}

      {remainingFits.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
            Show all {patternFits.length} pattern results
          </summary>
          <div className="mt-3 space-y-3">
            {remainingFits.map((fit) => (
              <PatternFitCard key={fit.patternId} fit={fit} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
