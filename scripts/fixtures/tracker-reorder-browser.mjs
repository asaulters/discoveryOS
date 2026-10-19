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
  page.on("pageerror", (error) => errors.push(error.message));
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
      name: "Reorder acceptance",
    });
    const wp = [];
    for (const name of ["Alpha WP", "Beta WP"])
      wp.push(
        await create("/api/work-packages", {
          project_id: project.id,
          name,
          sort_order: wp.length,
        }),
      );
    const tasks = [];
    for (const title of ["Alpha task", "Middle doing task", "Beta task"])
      tasks.push(
        await create("/api/tasks", {
          work_package_id: wp[0].id,
          title,
          sort_order: tasks.length,
          status: title.startsWith("Middle") ? "doing" : "todo",
        }),
      );
    const subtasks = [];
    for (const title of ["Alpha subtask", "Beta subtask"])
      subtasks.push(
        await create("/api/subtasks", { task_id: tasks[0].id, title }),
      );
    return { project, wp, tasks, subtasks };
  });
  await page.goto(`${origin}/projects/${seed.project.id}`);
  async function move(name, direction) {
    const refreshed = page.waitForResponse(
      (r) =>
        r.url() === `${origin}/api/projects/${seed.project.id}` &&
        r.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: `Move ${name} ${direction}`, exact: true })
      .click();
    await refreshed;
    await page
      .getByRole("button", { name: `Move ${name} ${direction}`, exact: true })
      .waitFor();
  }
  async function order() {
    return page.evaluate(
      async (id) => await (await fetch(`/api/projects/${id}`)).json(),
      seed.project.id,
    );
  }
  await move("Beta WP", "up");
  assert.deepEqual(
    (await order()).workPackages.map((w) => w.name),
    ["Beta WP", "Alpha WP"],
  );
  await move("Beta task", "up");
  assert.deepEqual(
    (await order()).tasks.map((t) => t.title),
    ["Alpha task", "Beta task", "Middle doing task"],
  );
  await move("Beta subtask", "up");
  assert.deepEqual(
    (await order()).subtasks.map((s) => s.title),
    ["Beta subtask", "Alpha subtask"],
  );
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Move Beta WP up", exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Move Beta subtask up", exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await move("Beta task", "up");
  assert.deepEqual(
    (await order()).tasks
      .filter((t) => t.status === "todo")
      .map((t) => t.title),
    ["Beta task", "Alpha task"],
  );
  assert.equal(
    (await order()).tasks.find((t) => t.id === seed.tasks[2].id).status,
    "todo",
  );
  // Failed writes retain the visible saved order and show the server error.
  await page.route("**/api/tracker/reorder", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "Reorder rejected" }),
    }),
  );
  await page
    .getByRole("button", { name: "Move Beta task down", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Reorder rejected" })
    .waitFor();
  assert.deepEqual(
    (await order()).tasks
      .filter((t) => t.status === "todo")
      .map((t) => t.title),
    ["Beta task", "Alpha task"],
  );
  await page.unroute("**/api/tracker/reorder");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("viewer@example.test");
  await page.goto(`${origin}/projects/${seed.project.id}`);
  assert.equal(
    await page.getByRole("button", { name: /^Move .* (up|down)$/ }).count(),
    0,
  );
  const denied = await page.evaluate(
    async (id) =>
      (
        await fetch("/api/tracker/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "task", id, direction: "up" }),
        })
      ).status,
    seed.tasks[0].id,
  );
  assert.equal(denied, 403);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: saved WP/task/subtask moves, reload persistence, boundaries, board column ordering, unchanged statuses, rejected-save feedback and viewer UI/API denial.",
  );
} finally {
  await browser.close();
}
