# Public hosting setup (Sprint 33)

1. Apply every SQL migration in `supabase/migrations/` in filename order,
   through `0040_tracker_notes_subtasks.sql`, before exposing the app publicly.
2. In Supabase Dashboard → Authentication → Users, create Adam's owner user
   and a viewer user with email/password. Confirm their email addresses in
   the dashboard. Copy their user UUIDs and run this in the SQL editor:

   ```sql
   insert into public.profiles (id, role) values
     ('OWNER_USER_UUID', 'owner'),
     ('VIEWER_USER_UUID', 'viewer');
   ```

   Profiles have no client write policies. Manage roles in the dashboard;
   users without a profile cannot access app data.
3. **Adam: turn off public sign-ups** in Supabase Dashboard → Authentication
   → Sign In / Providers → disable “Allow new users to sign up”. This is a
   dashboard setting, not application code. Keep the Email provider enabled
   for password sign-in. Disable anonymous sign-ins if enabled.
4. On the host, use Node.js 22 or newer and set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `OPENAI_API_KEY`. Optional `OPENAI_*_MODEL`
   overrides are listed in `.env.local.example`. Never prefix private keys
   with `NEXT_PUBLIC_`. The app no longer reads or needs
   `SUPABASE_SERVICE_ROLE_KEY`; remove it from the host's app environment.
   Set Supabase's Site URL to the HTTPS host URL. Build with `npm run build`
   and serve with `npm start`. Do not run the development server publicly.
   Keep CDN caching disabled for authenticated pages and API responses.

# Verification

Run `npm run typecheck`, `npm run lint`, `npm run test:auth-rls`, and the
existing self-tests. The SQL test applies all migrations to isolated
PostgreSQL (PGlite); it never modifies the hosted project. Start the app
on port 3033, then run `npm run test:signed-out` (or set
`AUTH_TEST_ORIGIN`). It discovers every page and API handler, including
Share and the Markdown export, and checks each supported HTTP method.

After provisioning the hosted database, verify the real REST boundary:

```sh
curl --fail-with-body "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/meetings?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# Must return [], even when meetings exist.
```

Sign in as viewer, open a meeting, and check that write controls are
disabled while evidence, filters, copies, exports and navigation still work.
Using a viewer access token (keep it out of source control), a direct insert
must fail with an RLS error:

```sh
curl -i "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/meetings" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VIEWER_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Must be rejected","meeting_type":"automation_discovery"}'
```

Sign in as owner and check create/start/edit/verify/lock/regenerate/live
capture. On `/regression`, run the existing deterministic regression runner
against a scenario meeting and inspect its checks. Scenario replay and batch
runs remain owner-only and can incur OpenAI usage. Sign out and confirm that
all meeting pages (including Share) redirect to `/login` and API calls return
401. `/login` is the intentional public page; sign-out only accepts POST.

The runtime Supabase factories are `lib/supabase/client.ts` (browser) and
`lib/supabase/server.ts` (server); `proxy.ts` creates the refresh client.
All use the anon key plus session cookies, so database RLS applies throughout.
OpenAI's private key is read only in the `server-only` module
`lib/services/openaiClient.ts`, which checks the owner role before creating
an OpenAI client. Its eight callers are setup analysis, fast loop, workflow
extraction, post-meeting review, opportunity assessment, audio transcription,
contradiction detection and conversation-state analysis.

# Sprint 33 validation record

- Production build, typecheck and lint passed.
- All 74 discovered signed-out route/method checks passed on both the local
  development server and production build.
- Existing self-tests passed: AI call runner 32, evidence quality 31, pattern
  fit 8. These are separate from the database-backed regression runner.
- All migrations applied in isolated PostgreSQL; all 30 application tables
  have SELECT/INSERT/UPDATE/DELETE policies. Anonymous reads returned no rows,
  viewer writes and profile escalation were denied, owner CRUD succeeded.
- Production dependency audit: zero known advisories. Next.js and its lint
  configuration were updated to 16.4.1 for security fixes. Five advisories
  remain in the development-only lint dependency chain (`braces` through
  `micromatch`/`fast-glob`); the audit suggests a breaking lint-config downgrade.
- Hosted verification completed October 15, 2026 after Adam resumed the
  project, applied 0033, provisioned owner/viewer profiles and disabled public
  sign-ups. Auth settings confirmed email sign-in enabled, public sign-ups
  disabled and anonymous sign-ins disabled. Adam confirmed owner/viewer login,
  sign-out and viewer controls in the browser.
- Anonymous REST reads returned zero rows. A viewer session could read a
  scratch meeting; a direct INSERT failed with PostgreSQL RLS code 42501,
  UPDATE and DELETE affected zero rows, and profile promotion was denied.
  Owner INSERT/SELECT/UPDATE/DELETE succeeded. The scratch meeting was removed.
- Authenticated viewer read API returned 200; viewer write API returned 403;
  an owner write with a foreign Origin returned 403. The local browser Host
  is now used for origin comparison and login redirects to handle Next.js's
  localhost normalization. Both 127.0.0.1 and localhost are covered by the
  request-origin regression test.
- The existing deterministic regression runner completed through the owner
  session API: run `62cc51a7-9800-4ae3-b926-dec548e98545`, 32 checks,
  **10 pass, 22 warn, 0 fail**, identical to the selected baseline. The
  existing scenario warnings remain; this is not an all-pass scenario result.
  No OpenAI calls were made. Temporary test sessions were signed out with
  local scope, preserving existing browser sessions.

Auth follows the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), using the Next.js 16 `proxy.ts` convention.

# Project tracker setup (Sprint 34)

For the existing hosted project, leave the verified Sprint 33 users and
settings unchanged. In Supabase SQL Editor run each **entire file** in order:

1. `supabase/migrations/0034_projects.sql`
2. `supabase/migrations/0035_work_packages_tasks.sql`
3. `supabase/migrations/0036_project_events.sql`

Do not rerun 0033 on a database where it has already succeeded. These three
migrations were applied by Adam and verified on the hosted project on
October 15, 2026.
Apply all three before opening the tracker; 0036 installs the atomic audit
triggers. Every new table enables RLS in its own migration and revokes all
anonymous privileges. No new environment variables or service role key are
needed. The tracker makes no AI calls and has no meeting-linking UI.

After applying them, open `/projects` as owner. Create a project, add two
work packages and tasks, and move a task through To do, Doing, Blocked (with
a reason), and Done in list and board. The task pane edits title, status,
due date, size, notes, reason and order. Archive a work package and use Show
archived to reveal it; restore its project/work package before editing its
tasks. Progress and open-task counts exclude archived work by default.
Hard deletes are blocked in SQL; archive/restore keeps history intact.

Project events are inserted by SQL triggers in the same transaction as the
write, including direct REST mutations. Events have no owner/viewer update
or delete grants/policies. Recent activity shows the latest 100 events on
the project page; all events remain in `project_events`.

`/my-week` selects open work due from today through six days ahead, all
overdue work, and all Doing/Blocked tasks even without a nearby due date.
Done on its board means completed in the current Monday–Sunday calendar
week. Grouping uses the browser's local calendar dates; a date-only deadline
never shifts with UTC. Archived tasks and ancestors are hidden unless Show
archived is on. List/board preference is stored under a user-specific key.
Login now lands on `/my-week`; the original `/` dashboard is unchanged.
Work package status uses the same To do / Doing / Blocked / Done vocabulary.

Run the repeatable checks:

```sh
npm run typecheck
npm run lint
npm run test:auth-rls
npm run test:tracker-model
npm run test:tracker-ui
npm run test:signed-out
```

`test:tracker-ui` runs the actual Next.js pages/API handlers against an
isolated PostgreSQL (PGlite) fixture with emulated Supabase Auth/PostgREST
transport and real SQL/RLS/triggers. It uses ports 3035 and 54339, a separate
ignored build directory, and dummy owner/viewer accounts. It never contacts
the hosted database or OpenAI. It automatically stops both test servers and
restores Next's generated configuration changes. It uses cached Playwright
Chromium or macOS Google Chrome; alternatively set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to your installed Chromium executable.

Sprint 34 validation: typecheck, lint, production build, all 71 existing
self-tests, the extended 34-table RLS test, date/grouping model tests and
isolated owner/viewer browser acceptance passed. Signed-out route discovery
now verifies 85 page/API method combinations. Browser coverage includes
project creation, two work packages, quick add, task status changes in both
views, blocked-reason rejection, task editing, archive visibility, events,
My week date/project grouping, completed-this-week board, project chips,
per-user preferences, keyboard menus and viewer API/direct REST denials.
The existing hosted DiscoveryOS regression remained unchanged: run
`3c420717-55e9-490a-a956-300d46279916`, 10 pass, 22 warnings, 0 failures.
Hosted tracker acceptance passed October 15, 2026 after Adam applied all
three migrations. All four tables denied anonymous REST reads. Viewer
INSERTs failed with RLS code 42501, UPDATE/DELETE affected no rows, and write
APIs returned 403. Both owner and viewer were denied event UPDATE/DELETE.
Owner APIs and the actual browser verified project creation, two work
packages, two tasks, list/board status transitions, missing blocked-reason
rejection, completion timestamps, editing, archive visibility and My week
by-day/by-project/board views. The verification project recorded 20 events
before cleanup (five creations and seven task status changes among them).
All verification rows were archived, preserving history; only the temporary
test sessions were revoked. All 85 signed-out route checks passed again.

Post-migration DiscoveryOS regression run
`fc9c7863-f5fe-4112-8ba8-1f32e3dd8d0b` also completed unchanged:
10 pass, 22 existing warnings, 0 failures, with no OpenAI calls.

# Meeting-to-project connections (Sprint 35)

After the already-applied Sprint 34 migrations, run each **whole file** in
Supabase Dashboard → SQL Editor, in this order:

1. `supabase/migrations/0037_meeting_project_link.sql`
2. `supabase/migrations/0038_raid_items.sql`
3. `supabase/migrations/0039_send_to_project.sql`

Apply all three before deploying this version. Do not rerun earlier
migrations. These migrations add the optional meeting/project link, copied
source keys and unique indexes, RAID with owner/viewer RLS, RAID audit
events, and the `send_to_project` security-invoker function. No environment
variables, Auth settings or service role key are added for this sprint.
Adam applied all three migrations, and hosted acceptance passed on
October 15, 2026.

As an owner, open a meeting's Review or Workflow page and find **Send to
project**. Pick a project (or create one there), tick the source items,
optionally edit titles and certainty, then send once. Tasks default to the
project's reusable **Discovery follow-ups** work package. Evidence and
source details are read from the database and copied by one atomic RPC;
a duplicate or invalid source rolls back the entire batch, its fallback
package, events and meeting link. Already-sent active items are disabled,
even if their destination is another project. Archiving the copied row
allows sending that source again.

Review array items use the review row id plus their array/index key.
Regenerating a review or assessment produces new source identities; it
does not rewrite copied tracker items. A stale selection is rejected;
use **Refresh items** after regenerating. An unlinked meeting is linked
on a successful send. A linked meeting keeps its original link even when
a particular batch is sent to a different project. Sending a decision
only offers **Move project to Decide?**; stage changes require that click.
No AI calls are made by these flows.

Project pages show linked meetings, a **New meeting for this project**
link with project/name/company/goal prefilled, and a **RAID** view grouped
by kind. Owner accounts can add RAID items and change their status.
**My week → Add task** defaults to Discovery follow-ups or the first active
work package; it creates Discovery follow-ups when there are none.
An optional due date makes a new to-do appear in the upcoming week;
undated to-dos remain on the project, consistent with the existing week
filter. Viewers can read evidence and RAID but cannot send or write.

Deleting a source meeting preserves copied tasks, work packages and RAID
items, quotes, certainty and source keys. Their meeting link becomes
**Meeting deleted**. Tracker records continue to use archive/restore.

Validation uses `npm run typecheck`, `npm run lint`, the 71 existing
self-tests, `npm run test:auth-rls`, `npm run test:signed-out`,
`npm run test:request-origin`, `npm run test:tracker-model` and
`npm run test:tracker-ui`. The extended SQL suite applies migrations
0001–0039 to isolated PostgreSQL and verifies all 35 application tables,
all source mappings, non-owner RPC rejection, duplicate blocking, complete
rollback, fallback reuse and copied records surviving meeting deletion.
The isolated browser scenario sends five items (follow-up, gap, mismatch,
recommendation and experiment) in one batch in under five minutes,
checks editable preview, evidence, explicit stage changes, saved project
prefill, My week add, RAID status/add and viewer API/direct REST denial.
All fixture data stays local and OpenAI credentials are absent.

The existing hosted database-backed regression was rerun on October 15,
2026 before applying 0037–0039: run
`fc99d451-aa1a-4b3d-b500-27e53cc098f9` matched the existing baseline,
**10 pass, 22 warnings, 0 failures**. All **89** signed-out page/API method
checks passed. Post-migration hosted acceptance also passed; see the record below.


Sprint 35 hosted acceptance passed after Adam applied 0037–0039.
Anonymous REST calls returned no meeting rows and were denied RAID access.
Viewer direct RAID INSERT and direct send RPC returned RLS/permission code
42501; viewer write APIs returned 403. A batch with a valid follow-up then
an invalid gap left no tasks, fallback package, events or meeting link.
The owner browser sent five selected items in one batch in under five
minutes: a follow-up, workflow gap, possible mismatch, no-build decision
and experiment. Quotes, edited title/certainty, recommendation confidence,
meeting link and globally disabled duplicate selection were verified.
A repeat API send returned 409. Stage stayed Intake until the explicit
Decide button was clicked. RAID status changes worked, and viewers saw
RAID/evidence without send, add or status controls. Deleting the scratch
meeting preserved copied tasks, work packages and RAID, with quotes and
Meeting deleted visible. The test project recorded 15 events before
cleanup; all tracker verification rows were archived and events preserved.
The scratch meeting was deleted and temporary test sessions revoked locally.
No OpenAI calls were made. All 89 signed-out checks passed again.
Post-migration regression run `5bc64b1c-3918-44a4-9a4b-fdfef5e6c2fb`
remained **10 pass, 22 existing warnings, 0 failures**.

# Faster task entry: notes and subtasks

Before deploying this change on Render, run the whole
`supabase/migrations/0040_tracker_notes_subtasks.sql` file in Supabase's SQL
Editor, after 0039. It adds optional work-package notes and task checklist
items with owner/viewer RLS and atomic activity events. Existing task notes
and meeting/project data are retained. No environment variables change.
Adam applied 0040, and production-build acceptance against hosted Supabase
passed on October 19, 2026.

Work-package create/edit forms now include optional Notes, displayed on the
package. Project quick-add and My week task creation include optional Notes,
so task details need not be opened afterward to add context.

In project List or Board, use **+ Subtask** beneath a task. Enter a title,
optionally add notes, then use **Add subtask** or Enter in the title field.
The form stays open and returns focus for repeated entry. The task details
pane also shows the checklist, including when opened from My week.
Checklist completion is independent of the parent task's status and task
progress counts. Subtasks have no separate due date or My week card.

Checklist items support complete/reopen and archive/restore. Project
**Show archived** includes archived checklist items. Archived tasks, packages
and projects disable checklist writes in the app/API. Viewers can read notes
and subtasks, but cannot add, complete or archive them; database RLS guards
direct writes too. Checklist changes appear against their parent task in
Recent activity. A failed activity insert rolls back the checklist change.

Validation passed locally: typecheck, lint, production build, 71 existing
self-tests, tracker model/request-origin checks, 36-table isolated SQL/RLS,
the full tracker/discovery browser suite and 91 signed-out route checks.
New browser acceptance includes repeated keyboard entry and focus, optional
notes persistence, rejected-save rollback, checklist archive/restore and
viewer API/direct REST denial. Hosted acceptance passed after application of 0040.


Post-0040 hosted verification confirmed package/task/checklist notes saved
at creation, repeated browser checklist entry, reload persistence,
List/Board completion and reopening, parent status remaining independent,
viewer read-only controls and denied viewer API/direct REST writes.
Anonymous checklist reads were denied. Checklist changes appeared in
project activity. All verification rows were archived and temporary test
sessions revoked locally. All 91 signed-out checks passed again. Existing
regression run `fd134a6c-f494-4191-acb9-1d9291226d34` remained
10 pass, 22 existing warnings, 0 failures. No OpenAI calls were made.
