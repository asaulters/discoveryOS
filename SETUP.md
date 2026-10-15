# Public hosting setup (Sprint 33)

1. Apply every SQL migration in `supabase/migrations/` in filename order,
   ending with `0033_auth_rls.sql`, before exposing the app publicly.
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
