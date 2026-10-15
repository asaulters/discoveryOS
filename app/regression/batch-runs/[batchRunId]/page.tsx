import Link from "next/link";
import { buildBatchRegressionReview } from "@/lib/services/regressionReview";
import BatchRunReview from "../../BatchRunReview";

// Same reasoning as /regression itself: this reads live DB rows on every
// visit, no static route segment to force that otherwise.
export const dynamic = "force-dynamic";

export default async function BatchRegressionRunDetailPage({
  params,
}: {
  params: Promise<{ batchRunId: string }>;
}) {
  const { batchRunId } = await params;
  const review = await buildBatchRegressionReview(batchRunId);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/regression" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
        ← Regression Runner
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Batch Regression Run</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every scenario in this batch, grouped so failures and warnings are easy to triage without
        rerunning anything.
      </p>

      <div className="mt-8">
        {review ? (
          <BatchRunReview review={review} />
        ) : (
          <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
            This batch regression run doesn&apos;t exist (it may have been deleted, or the id is
            wrong).
          </p>
        )}
      </div>
    </main>
  );
}
