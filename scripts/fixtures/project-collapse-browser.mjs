import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
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
  const seed = await page.evaluate(async () => {
    async function create(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error(await response.text());
      return response.json();
    }
    const project = await create("/api/projects", {
      name: "Collapse acceptance",
    });
    const wp = await create("/api/work-packages", {
      project_id: project.id,
      name: "Alpha package",
      notes: "Package context",
    });
    await create("/api/work-packages", {
      project_id: project.id,
      name: "Beta package",
    });
    const task = await create("/api/tasks", {
      work_package_id: wp.id,
      title: "Alpha task",
    });
    await create("/api/tasks", { work_package_id: wp.id, title: "Beta task" });
    await create("/api/subtasks", {
      task_id: task.id,
      title: "Checklist item",
    });
    return { project, wp, task };
  });
  await page.goto(`${origin}/projects/${seed.project.id}`);
  let writes = 0;
  page.on("request", (r) => {
    if (
      r.url().includes("/api/") &&
      ["POST", "PATCH", "DELETE"].includes(r.method())
    )
      writes++;
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const checklist = page.getByLabel("Complete subtask: Checklist item", {
    exact: true,
  });
  assert.equal(await checklist.isVisible(), true);
  await button("Collapse task: Alpha task").click();
  assert.equal(await checklist.isVisible(), false);
  assert.equal(await button("Alpha task").isVisible(), true);
  await page.getByText("1 subtask · 0 complete", { exact: true }).waitFor();
  await button("Expand task: Alpha task").focus();
  await page.keyboard.press("Enter");
  assert.equal(await checklist.isVisible(), true);
  const subtasks = page.getByRole("region", {
    name: "Subtasks for Alpha task",
    exact: true,
  });
  await subtasks
    .getByRole("button", { name: "+ Subtask", exact: true })
    .click();
  await subtasks
    .getByLabel("Subtask title", { exact: true })
    .fill("Unsaved draft");
  await button("Collapse task: Alpha task").click();
  await button("Expand task: Alpha task").click();
  assert.equal(
    await subtasks.getByLabel("Subtask title", { exact: true }).inputValue(),
    "Unsaved draft",
  );
  await button("Collapse work package: Alpha package").click();
  assert.equal(await checklist.isVisible(), false);
  assert.equal(
    await page
      .getByRole("heading", { name: "Alpha package", exact: true })
      .isVisible(),
    true,
  );
  await button("Expand work package: Alpha package").click();
  assert.equal(
    await subtasks.getByLabel("Subtask title", { exact: true }).inputValue(),
    "Unsaved draft",
  );
  await button("Collapse all").click();
  await page.reload();
  await button("Expand work package: Alpha package").click();
  await button("Expand task: Alpha task").waitFor();
  assert.equal(await checklist.isVisible(), false);
  await button("Expand task: Alpha task").click();
  assert.equal(await checklist.isVisible(), true);
  await button("Expand all").click();
  await button("Collapse work package: Beta package").waitFor();
  await button("Collapse task: Beta task").waitFor();
  await button("Collapse all tasks").click();
  assert.equal(await checklist.isVisible(), false);
  await page.reload();
  await button("Expand task: Alpha task").waitFor();
  assert.equal(await checklist.isVisible(), false);
  await button("Board").click();
  await button("Expand task: Alpha task").click();
  assert.equal(await checklist.isVisible(), true);
  await button("Collapse all work packages").click();
  assert.equal(await button("Alpha task").count(), 0);
  await page.reload();
  await button("Expand work package: Alpha package").waitFor();
  assert.equal(await button("Alpha task").count(), 0);
  const lane = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Alpha package", exact: true }),
  });
  await lane.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Work package name", { exact: true }).waitFor();
  await lane.getByRole("button", { name: "Edit", exact: true }).click();
  await button("Expand all work packages").click();
  await button("Expand all tasks").click();
  assert.equal(await checklist.isVisible(), true);
  await button("Collapse all work packages").click();
  assert.equal(
    writes,
    0,
    "Collapse and layout controls never write to the API",
  );
  await button("Sign out").click();
  await page.waitForURL("**/login");
  await login("viewer@example.test");
  await page.goto(`${origin}/projects/${seed.project.id}`);
  await button("Collapse work package: Alpha package").waitFor();
  assert.equal(
    await checklist.isVisible(),
    true,
    "Owner collapse preferences must not affect a viewer",
  );
  await button("Collapse task: Alpha task").click();
  assert.equal(await checklist.isVisible(), false);
  await button("Collapse all").click();
  await page.reload();
  await button("Expand work package: Alpha package").waitFor();
  await button("Expand all").click();
  assert.equal(await checklist.isVisible(), true);
  assert.equal(
    await checklist.isEnabled(),
    false,
    "View preferences do not grant viewer write permissions",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: WP/task collapse in list/board, bulk controls, keyboard access, reload persistence, draft retention, edit auto-expand, no API writes and separate viewer preferences.",
  );
} finally {
  await browser.close();
}
