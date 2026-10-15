import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(chromium.executablePath())
    ? chromium.executablePath()
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const origin = "http://127.0.0.1:3035";
const browser = await chromium.launch({ executablePath, headless: true });
try {
  await fetch("http://127.0.0.1:54339/__reset");
  const seed = await (
    await fetch("http://127.0.0.1:54339/__seed-discovery")
  ).json();
  assert.ok(seed.meeting, JSON.stringify(seed));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function login(email) {
    await page.goto(origin + "/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/my-week");
  }
  await login("owner@example.test");
  const started = Date.now();
  await page.goto(`${origin}/meetings/${seed.meeting}/review`);
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Send to project", exact: true }),
  });
  await panel.getByLabel("Project", { exact: true }).selectOption(seed.project);
  for (const title of [
    "Check approval ownership",
    "Backup owner",
    "Needs clarification: Approval timing",
    "no build",
    "Observe three manual approvals",
  ])
    await panel.getByRole("checkbox", { name: title, exact: true }).check();
  await panel
    .getByLabel("Title", { exact: true })
    .first()
    .fill("Confirm approval owner");
  await panel
    .getByLabel("Certainty", { exact: true })
    .first()
    .selectOption("known");
  let batches = 0;
  page.on("request", (r) => {
    if (r.url().includes("/send-to-project") && r.method() === "POST")
      batches++;
  });
  await panel
    .getByRole("button", { name: "Send 5 selected items", exact: true })
    .click();
  await panel
    .getByRole("link", { name: "Open project", exact: true })
    .waitFor();
  assert.equal(batches, 1);
  await panel
    .getByRole("button", { name: "Move project to Decide?", exact: true })
    .waitFor();
  assert.equal(
    await panel
      .getByRole("checkbox", { name: "Backup owner", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(
      async (id) =>
        (await (await fetch(`/api/projects/${id}`)).json()).projects[0].stage,
      seed.project,
    ),
    "intake",
  );
  await panel
    .getByRole("button", { name: "Move project to Decide?", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Move project to Decide?", exact: true })
    .waitFor({ state: "detached" });
  await panel.getByRole("link", { name: "Open project", exact: true }).click();
  await page
    .getByRole("heading", { name: "Discovery connection", exact: true })
    .waitFor();
  assert.match(await page.locator("header").last().innerText(), /Decide/i);
  await page
    .getByRole("button", { name: "Confirm approval owner", exact: true })
    .waitFor();
  assert.ok(
    (await page
      .getByText("We wait when Sam is away", { exact: true })
      .count()) > 0,
  );
  await page
    .getByRole("heading", {
      name: "Observe three manual approvals",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("link", { name: "Tracker connection scenario", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "RAID", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Needs clarification: Approval timing",
      exact: true,
    })
    .waitFor();
  await page.getByRole("heading", { name: "no build", exact: true }).waitFor();
  assert.match(
    await page.locator("main").innerText(),
    /A: We approve daily\nB: It waits until Friday/,
  );
  await page
    .getByLabel("Status for no build", { exact: true })
    .selectOption("resolved");
  await page
    .getByRole("button", { name: "Add RAID item", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Manual assumption");
  await page.getByLabel("Kind", { exact: true }).selectOption("assumption");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("heading", { name: "Manual assumption", exact: true })
    .waitFor();
  assert.ok(
    Date.now() - started < 300000,
    "Scenario send takes under five minutes",
  );
  await page
    .getByRole("link", { name: "New meeting for this project", exact: true })
    .click();
  assert.equal(
    await page.locator("input#name").inputValue(),
    "Discovery connection",
  );
  assert.equal(await page.locator("input#company").inputValue(), "Operations");
  assert.equal(
    await page.locator("textarea#goal").inputValue(),
    "Check the handoff",
  );
  await page.locator("select#meetingType").selectOption("automation_discovery");
  const creation = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/meetings" && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create meeting", exact: true })
    .click();
  const createdResponse = await creation,
    created = await createdResponse.json();
  assert.equal(createdResponse.status(), 201, JSON.stringify(created));
  assert.equal(created.meeting.project_id, seed.project);
  await page.goto(`${origin}/meetings/${seed.meeting}/workflow`);
  await page
    .getByRole("heading", { name: "Send to project", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Project", { exact: true }).inputValue(),
    seed.project,
  );
  // My week add works with a default work package and optional date.
  await page.goto(origin + "/my-week");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Weekly follow-up");
  await page
    .getByLabel("Due date (optional)", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("button", { name: "Weekly follow-up" }).waitFor();
  // Delete the meeting through the owner's session REST client to exercise FK behavior.
  const deleted = await page.evaluate(async (id) => {
    const r = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    return { status: r.status, body: await r.text() };
  }, seed.meeting);
  // Existing app has no general meeting DELETE endpoint: use the authenticated fixture REST session.
  if (deleted.status === 405 || deleted.status === 404) {
    const auth = await (
      await fetch("http://127.0.0.1:54339/auth/v1/token", {
        method: "POST",
        body: JSON.stringify({ email: "owner@example.test" }),
      })
    ).json();
    const r = await fetch(
      `http://127.0.0.1:54339/rest/v1/meetings?id=eq.${seed.meeting}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.access_token}` },
      },
    );
    assert.equal(r.status, 200);
  } else assert.ok(deleted.status < 300, deleted.body);
  await page.goto(`${origin}/projects/${seed.project}`);
  await page.getByText("Meeting deleted", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("viewer@example.test");
  await page.getByText("Viewer (read only)", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Add task", exact: true }).count(),
    0,
  );
  await page.goto(`${origin}/projects/${seed.project}`);
  await page.getByRole("button", { name: "RAID", exact: true }).click();
  await page.getByRole("heading", { name: "no build", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Add RAID item", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByLabel("Status for no build", { exact: true }).count(),
    0,
  );
  assert.ok(await page.getByText("Meeting deleted", { exact: true }).count());
  const denied = await page.evaluate(
    async (project_id) =>
      (
        await fetch("/api/raid-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id,
            kind: "risk",
            title: "Viewer write",
          }),
        })
      ).status,
    seed.project,
  );
  assert.equal(denied, 403);
  const viewerAuth = await (
    await fetch("http://127.0.0.1:54339/auth/v1/token", {
      method: "POST",
      body: JSON.stringify({ email: "viewer@example.test" }),
    })
  ).json();
  const direct = await fetch("http://127.0.0.1:54339/rest/v1/raid_items", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${viewerAuth.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project_id: seed.project,
      kind: "risk",
      title: "REST viewer write",
    }),
  });
  assert.equal(direct.status, 403);
  assert.equal((await direct.json()).code, "42501");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scenario batch under five minutes; review/workflow selection, editable preview, one RPC, dedupe, project meetings/prefill, RAID status/add, My week add, deleted-meeting evidence and viewer controls.",
  );
} finally {
  await browser.close();
}
