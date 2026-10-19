import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(chromium.executablePath())
    ? chromium.executablePath()
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const origin = "http://127.0.0.1:3035";
const browser = await chromium.launch({ executablePath, headless: true });
try {
  await fetch("http://127.0.0.1:54339/__reset");
  const page = await browser.newPage();
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
  const project = await page.evaluate(async () =>
    (
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Notes and checklist" }),
      })
    ).json(),
  );
  await page.goto(`${origin}/projects/${project.id}`);
  await page
    .getByRole("button", { name: "+ Work package", exact: true })
    .click();
  await page
    .getByLabel("Work package name", { exact: true })
    .fill("Delivery package");
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("Package context\nSecond line");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByText("Package context\nSecond line", { exact: true })
    .waitFor();
  const lane = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Delivery package", exact: true }),
  });
  await lane
    .getByLabel("New task in Delivery package", { exact: true })
    .fill("Prepare handoff");
  await lane
    .getByLabel("Task notes in Delivery package", { exact: true })
    .fill("Discuss backup ownership");
  await lane.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare handoff", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Prepare handoff", exact: true })
    .click();
  let pane = page.getByRole("dialog");
  assert.equal(
    await pane.getByLabel("Notes", { exact: true }).inputValue(),
    "Discuss backup ownership",
  );
  await pane.getByRole("button", { name: "Close", exact: true }).click();
  const checklist = () =>
    page.getByRole("region", {
      name: "Subtasks for Prepare handoff",
      exact: true,
    });
  await checklist()
    .getByRole("button", { name: "+ Subtask", exact: true })
    .click();
  await checklist()
    .getByLabel("Subtask title", { exact: true })
    .fill("Confirm backup owner");
  await checklist()
    .getByLabel("Subtask notes (optional)", { exact: true })
    .fill("Ask Sam and Alex");
  await checklist()
    .getByRole("button", { name: "Add subtask", exact: true })
    .click();
  await checklist().getByText("Ask Sam and Alex", { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement === document.querySelector('section[aria-label="Subtasks for Prepare handoff"] input[name="title"]'));
  await checklist()
    .getByLabel("Subtask title", { exact: true })
    .fill("Document escalation");
  await checklist().getByLabel("Subtask title", { exact: true }).press("Enter");
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Document escalation",
      exact: true,
    })
    .waitFor();
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Confirm backup owner",
      exact: true,
    })
    .check();
  await checklist()
    .getByText("Subtasks: 1/2 complete", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Status for Prepare handoff", { exact: true })
      .inputValue(),
    "todo",
  );
  // A rejected checkbox save restores its persisted state and reports the error.
  await page.route("**/api/subtasks/*", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated save rejection" }),
    }),
  );
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Document escalation",
      exact: true,
    })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Simulated save rejection" })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(
        'input[aria-label="Complete subtask: Document escalation"]',
      )?.checked === false,
  );
  await page.unroute("**/api/subtasks/*");
  await page.reload();
  await checklist()
    .getByText("Subtasks: 1/2 complete", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await checklist()
    .getByRole("button", { name: "+ Subtask", exact: true })
    .click();
  await checklist()
    .getByLabel("Subtask title", { exact: true })
    .fill("Board checklist entry");
  await checklist()
    .getByRole("button", { name: "Add subtask", exact: true })
    .click();
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Board checklist entry",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Prepare handoff", exact: true })
    .click();
  pane = page.getByRole("dialog");
  await pane
    .getByRole("checkbox", {
      name: "Complete subtask: Confirm backup owner",
      exact: true,
    })
    .uncheck();
  await pane.getByText("Subtasks: 0/3 complete", { exact: true }).waitFor();
  await pane.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  const first = checklist()
    .locator("div.my-2")
    .filter({
      has: page.getByRole("checkbox", {
        name: "Complete subtask: Confirm backup owner",
        exact: true,
      }),
    });
  await first
    .getByRole("button", { name: "Archive subtask", exact: true })
    .click();
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Confirm backup owner",
      exact: true,
    })
    .waitFor({ state: "hidden" });
  await page.getByLabel("Show archived", { exact: true }).check();
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Confirm backup owner",
      exact: true,
    })
    .waitFor();
  await first
    .getByRole("button", { name: "Restore subtask", exact: true })
    .click();
  const snapshot = await page.evaluate(
    async (id) => (await fetch(`/api/projects/${id}`)).json(),
    project.id,
  );
  const task = snapshot.tasks[0],
    subtask = snapshot.subtasks[0];
  assert.equal(snapshot.workPackages[0].notes, "Package context\nSecond line");
  assert.equal(task.notes, "Discuss backup ownership");
  assert.equal(snapshot.subtasks.length, 3);
  assert.ok(snapshot.events.some((e) => e.action === "subtask_completed"));
  // Optional notes stay optional on both creation paths.
  await lane
    .getByLabel("New task in Delivery package", { exact: true })
    .fill("Task without notes");
  await lane.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByRole("button", { name: "Task without notes", exact: true })
    .waitFor();
  await page.goto(origin + "/my-week");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Weekly task with notes");
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("Weekly context");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).waitFor();
  const weekly = await page.evaluate(async () =>
    (await (await fetch("/api/projects")).json()).tasks.find(
      (t) => t.title === "Weekly task with notes",
    ),
  );
  assert.equal(weekly.notes, "Weekly context");
  await page.evaluate(
    async (id) =>
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
    task.id,
  );
  assert.equal(
    await page.evaluate(
      async (id) =>
        (
          await fetch(`/api/subtasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_done: true }),
          })
        ).status,
      subtask.id,
    ),
    409,
  );
  await page.evaluate(
    async (id) =>
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      }),
    task.id,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("viewer@example.test");
  await page.goto(`${origin}/projects/${project.id}`);
  await checklist()
    .getByRole("checkbox", {
      name: "Complete subtask: Confirm backup owner",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await checklist()
      .getByRole("checkbox", {
        name: "Complete subtask: Confirm backup owner",
        exact: true,
      })
      .isDisabled(),
    true,
  );
  assert.equal(
    await checklist()
      .getByRole("button", { name: "+ Subtask", exact: true })
      .count(),
    0,
  );
  await page
    .getByText("Package context\nSecond line", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      async (task_id) =>
        (
          await fetch("/api/subtasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task_id, title: "Forbidden" }),
          })
        ).status,
      task.id,
    ),
    403,
  );
  const auth = await (
    await fetch("http://127.0.0.1:54339/auth/v1/token", {
      method: "POST",
      body: JSON.stringify({ email: "viewer@example.test" }),
    })
  ).json();
  const direct = await fetch("http://127.0.0.1:54339/rest/v1/task_subtasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task_id: task.id, title: "Forbidden REST" }),
  });
  assert.equal(direct.status, 403);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: package/task optional notes persist; inline list/board/pane subtask add, Enter repeat entry, completion, reopen, archive/restore, reload, archived-parent rejection, viewer controls and direct REST denial.",
  );
} finally {
  await browser.close();
}
