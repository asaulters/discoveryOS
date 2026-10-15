import Link from "next/link";
import { buildSingleRegressionReview } from "@/lib/services/regressionReview";
import SingleRunReview from "../../SingleRunReview";

// Same reasoning as /regression itself: this reads a live DB row on every
// visit, no static route segment to force that otherwise.
export const dynamic = "force-dynamic";

export default async function RegressionRunDetailPage({
  params,
}: {
  params: Promise<{ regressionRunId: string }>;
}) {
  const { regressionRunId } = await params;
  const review = await buildSingleRegressionReview(regressionRunId);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/regression" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
        ← Regression Runner
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Regression Run</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Readable without rerunning - grouped by what a failure or warning likely means, not just
        the raw check category.
      </p>

      <div className="mt-8">
        {review ? (
          <SingleRunReview
            run={review.run}
            checks={review.checks}
            meetingId={review.meetingId}
            meetingName={review.meetingName}
            meetingExists={review.meetingExists}
            scenarioName={review.scenarioName}
          />
        ) : (
          <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
            This regression run doesn&apos;t exist (it may have been deleted, or the id is wrong).
          </p>
        )}
      </div>
    </main>
  );
}
