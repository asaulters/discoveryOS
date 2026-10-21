import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
import { importModules } from "./import-module.mjs";
const { readCsv, serializeUpdateCsv } = await importModules();
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(chromium.executablePath())
    ? chromium.executablePath()
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const origin = "http://127.0.0.1:3035",
  browser = await chromium.launch({ executablePath, headless: true });
try {
  await fetch("http://127.0.0.1:54339/__reset");
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
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
  const seed = await page.evaluate(async () => {
    async function create(path, body) {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error(await r.text());
      return r.json();
    }
    const project = await create("/api/projects", {
      name: "Daily update project",
      notes: "Original context",
    });
    const wp = await create("/api/work-packages", {
      project_id: project.id,
      name: "Delivery",
    });
    const task = await create("/api/tasks", {
      work_package_id: wp.id,
      title: "Existing action",
      notes: "Keep existing notes",
      due_date: "2026-10-30",
    });
    const subtask = await create("/api/subtasks", {
      task_id: task.id,
      title: "Check result",
    });
    return { project, wp, task, subtask };
  });
  await page.goto(`${origin}/projects/${seed.project.id}`);
  const section = page.getByRole("region", {
    name: "Project CSV updates",
    exact: true,
  });
  await section
    .getByRole("button", { name: "Daily CSV updates", exact: true })
    .click();
  async function downloadBaseline() {
    const pending = page.waitForEvent("download");
    await section
      .getByRole("link", { name: "Download current CSV baseline", exact: true })
      .click();
    return readFileSync(await (await pending).path(), "utf8");
  }
  const baseline = await downloadBaseline();
  assert.match(baseline, new RegExp(seed.task.id));
  function decode(text) {
    const rows = readCsv(text),
      head = rows.shift().cells;
    return rows.map((r) =>
      Object.fromEntries(head.map((h, i) => [h, r.cells[i]])),
    );
  }
  const rows = decode(baseline);
  rows[0].report_date = "2026-10-21";
  rows[0].update_summary = "Implementation verified, next action identified";
  const taskRow = rows.find((r) => r.type === "task");
  taskRow.status = "done";
  taskRow.notes = "";
  taskRow.progress_note = "Build passed";
  rows.find((r) => r.type === "subtask").is_done = "true";
  rows.push({
    type: "task",
    key: "next_action",
    parent_key: rows.find((r) => r.type === "work_package").key,
    name: "Next action",
    action: "create",
    notes: "New agreed work",
  });
  const csv = serializeUpdateCsv(rows);
  async function upload(text) {
    await section
      .getByLabel("Project update CSV", { exact: true })
      .setInputFiles({
        name: "daily.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(text),
      });
    await section
      .getByRole("button", { name: "Preview project updates", exact: true })
      .click();
    await section
      .getByRole("heading", { name: "Update preview", exact: true })
      .waitFor();
  }
  async function state() {
    return page.evaluate(
      async (id) => await (await fetch(`/api/projects/${id}`)).json(),
      seed.project.id,
    );
  }
  await upload(csv);
  await section
    .getByText("2026-10-21 · 1 new · 2 updated · 2 unchanged", { exact: true })
    .waitFor();
  assert.equal((await state()).tasks.length, 1, "Preview writes nothing");
  assert.equal(
    await section
      .getByRole("button", { name: "Apply CSV updates", exact: true })
      .isEnabled(),
    false,
  );
  await section.getByRole("checkbox").check();
  await section
    .getByRole("button", { name: "Apply CSV updates", exact: true })
    .click();
  await section
    .getByRole("status")
    .filter({ hasText: "Project updated." })
    .waitFor();
  const after = await state();
  assert.equal(after.tasks.length, 2);
  assert.equal(after.tasks.find((t) => t.id === seed.task.id).status, "done");
  assert.equal(
    after.tasks.find((t) => t.id === seed.task.id).notes,
    "Keep existing notes\n[2026-10-21] Build passed",
  );
  assert.equal(
    after.tasks.find((t) => t.id === seed.task.id).due_date,
    "2026-10-30",
  );
  assert.equal(after.subtasks[0].is_done, true);
  const sourceDownload = page.waitForEvent("download");
  await section
    .getByRole("link", { name: "Download uploaded CSV", exact: true })
    .click();
  assert.equal(readFileSync(await (await sourceDownload).path(), "utf8"), csv);
  const current = decode(await downloadBaseline());
  assert.equal(
    current.find((r) => r.key === "next_action").record_id,
    after.tasks.find((t) => t.title === "Next action").id,
  );
  // A human edit after preview must not be overwritten by a stale confirmation.
  current[0].update_summary = "Preview concurrency check";
  current.find((r) => r.type === "task").progress_note = "Next report";
  await upload(serializeUpdateCsv(current));
  await page.evaluate(async (id) => {
    const r = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Concurrent human edit" }),
    });
    if (!r.ok) throw Error(await r.text());
  }, seed.task.id);
  await section.getByRole("checkbox").check();
  await section
    .getByRole("button", { name: "Apply CSV updates", exact: true })
    .click();
  await section
    .getByRole("alert")
    .filter({ hasText: "changed since preview" })
    .waitFor();
  assert.equal(
    (await state()).tasks.find((t) => t.id === seed.task.id).notes,
    "Concurrent human edit",
  );
  // Identical re-uploads are idempotent, including new rows and dated notes.
  await upload(csv);
  await section.getByRole("checkbox").check();
  await section
    .getByRole("button", { name: "Apply CSV updates", exact: true })
    .click();
  await section
    .getByRole("status")
    .filter({ hasText: "already applied" })
    .waitFor();
  assert.equal((await state()).tasks.length, 2);
  // A deployment against the old database function pauses writes but keeps reads.
  await fetch("http://127.0.0.1:54339/__csv-legacy", {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });
  try {
    await section
      .getByLabel("Project update CSV", { exact: true })
      .setInputFiles({
        name: "paused.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
    await section
      .getByRole("button", { name: "Preview project updates", exact: true })
      .click();
    await section
      .getByRole("alert")
      .filter({ hasText: "migration 0045" })
      .waitFor();
    assert.equal(
      await section
        .getByRole("button", { name: "Apply CSV updates", exact: true })
        .count(),
      0,
    );
    assert.match(await downloadBaseline(), new RegExp(seed.task.id));
  } finally {
    await fetch("http://127.0.0.1:54339/__csv-legacy", {
      method: "POST",
      body: JSON.stringify({ enabled: false }),
    });
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("viewer@example.test");
  await page.goto(`${origin}/projects/${seed.project.id}`);
  await section
    .getByRole("button", { name: "Daily CSV updates", exact: true })
    .click();
  await section
    .getByRole("link", { name: "Download uploaded CSV", exact: true })
    .waitFor();
  assert.equal(
    await section.getByLabel("Project update CSV", { exact: true }).count(),
    0,
  );
  const denied = await page.evaluate(
    async ({ id, csv }) =>
      (
        await fetch(`/api/projects/${id}/csv-updates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "preview",
            csv,
            report_date: "2026-10-21",
            request_id: crypto.randomUUID(),
          }),
        })
      ).status,
    { id: seed.project.id, csv },
  );
  assert.equal(denied, 403);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: daily CSV baseline download, preview without writes, explicit confirmation, existing updates/new rows, notes preservation, history source bytes, exported IDs, stale-preview rejection, idempotent re-upload and viewer read-only access.",
  );
} finally {
  await browser.close();
}
