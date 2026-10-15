import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(chromium.executablePath())
    ? chromium.executablePath()
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3035";
(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(20000);
    await page.goto(origin + "/login");
    await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("isolated-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/my-week");
    await page.evaluate(async () => {
      async function save(path, body, method = "POST") {
        const r = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      }
      const project = await save("/api/projects", { name: "Another project" }),
        w = await save("/api/work-packages", {
          name: "Weekly package",
          project_id: project.id,
        });
      const today = new Date(),
        day = (d) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const past = new Date(today);
      past.setDate(past.getDate() - 2);
      for (const t of [
        { title: "Other project task", due_date: day(today) },
        { title: "Overdue task", due_date: day(past) },
        { title: "Undated task", status: "doing" },
        { title: "Completed task", status: "done", due_date: day(today) },
      ])
        await save("/api/tasks", { ...t, work_package_id: w.id });
      const snapshot = await (await fetch("/api/projects")).json();
      const archived = snapshot.workPackages.find((w) => w.archived_at);
      await save(
        "/api/work-packages/" + archived.id,
        { archived: false },
        "PATCH",
      );
      await save("/api/tasks", {
        title: "Hidden archived lane task",
        due_date: day(today),
        work_package_id: archived.id,
      });
      await save(
        "/api/work-packages/" + archived.id,
        { archived: true },
        "PATCH",
      );
    });
    await page.reload();
    await page.getByRole("button", { name: "By day", exact: true }).click();
    const overdue = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Overdue", exact: true }),
    });
    assert.equal(
      await overdue.getByRole("button", { name: /Overdue task/ }).count(),
      1,
    );
    const noDate = page.locator("section").filter({
      has: page.getByRole("heading", { name: "No date", exact: true }),
    });
    assert.equal(
      await noDate.getByRole("button", { name: /Undated task/ }).count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Completed task", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Hidden archived lane task", exact: true })
        .count(),
      0,
    );
    await page.getByLabel("Show archived", { exact: true }).check();
    await page
      .getByRole("button", { name: /Hidden archived lane task/ })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Status for Hidden archived lane task", { exact: true })
        .isDisabled(),
      true,
    );
    await page.getByLabel("Show archived", { exact: true }).uncheck();
    assert.equal(
      await page
        .getByRole("button", { name: /Hidden archived lane task/ })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "By project", exact: true }).click();
    const other = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Another project",
        exact: true,
      }),
    });
    assert.equal(
      await other.getByRole("button", { name: /Other project task/ }).count(),
      1,
    );
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page
      .getByRole("button", { name: "Completed task", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Browser acceptance project", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Other project task", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Browser task", exact: true })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "Another project", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Browser task", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Other project task", exact: true })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "Other project task", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const select = page.getByLabel("Status for Other project task", {
      exact: true,
    });
    await select.press("d");
    await select.press("Enter");
    await page.waitForTimeout(500);
    assert.equal(await select.inputValue(), "doing");
    // Direct REST uses only the anon apikey plus the viewer's own signed JWT.
    const login = await (
      await fetch("http://127.0.0.1:54339/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "viewer@example.test",
          password: "test",
        }),
      })
    ).json();
    const denied = await fetch("http://127.0.0.1:54339/rest/v1/projects", {
      method: "POST",
      headers: {
        apikey: "isolated-anon-key",
        Authorization: "Bearer " + login.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Forbidden" }),
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, "42501");
    const bulk = await (
      await fetch("http://127.0.0.1:54339/__seed-pagination", {
        method: "POST",
      })
    ).json();
    const count = await page.evaluate(async (id) => {
      const response = await fetch("/api/projects");
      const snapshot = await response.json();
      return snapshot.tasks.filter((task) => task.work_package_id === id)
        .length;
    }, bulk.workPackageId);
    assert.equal(
      count,
      1101,
      "Tracker must read all tasks beyond PostgREST's single-response cap",
    );
    await page.screenshot({
      path: "/tmp/discovery-tracker-week-verified.png",
      fullPage: true,
    });
    console.log(
      "PASS: Overdue/No date/by-project grouping; done-this-week board; archived ancestor exclusion; project chips hide other projects; task pane Enter/Escape; native keyboard status menu; direct viewer REST denied by RLS; 1,101 tasks paginated without omissions.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
