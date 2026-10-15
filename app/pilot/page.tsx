import { getPilotDashboardData } from "@/lib/services/pilotDashboard";
import { getFieldTestDashboardSummary } from "@/lib/services/fieldTests";
import PilotDashboardClient from "./PilotDashboardClient";

// Must reflect newly saved pilot notes on every load, same reasoning as
// the main dashboard (app/page.tsx) and /regression.
export const dynamic = "force-dynamic";

const EMPTY_FIELD_TEST_DATA = {
  fieldTests: [],
  summary: {
    totalCount: 0,
    completedCount: 0,
    strongSignalCount: 0,
    mixedOrWeakSignalCount: 0,
    avgOverallUsefulness: null,
    needingNextIterationCount: 0,
    remoteTestsCompletedCount: 0,
    avgTranscriptUsefulness: null,
    highManualNotesNeedCount: 0,
    captureSetupsUsed: {},
  },
};

export default async function PilotDashboardPage() {
  const [{ meetings, issues, summary }, fieldTestData] = await Promise.all([
    getPilotDashboardData(),
    // Never let field tests (Sprint 28), or a not-yet-applied migration, fail the whole pilot dashboard.
    getFieldTestDashboardSummary().catch(() => EMPTY_FIELD_TEST_DATA),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Pilot Feedback</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Review real pilot meetings, open issues, and follow-ups.
      </p>

      <PilotDashboardClient
        meetings={meetings}
        issues={issues}
        summary={summary}
        fieldTests={fieldTestData.fieldTests}
        fieldTestSummary={fieldTestData.summary}
      />
    </main>
  );
}
