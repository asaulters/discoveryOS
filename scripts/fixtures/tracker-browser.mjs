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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fetch("http://127.0.0.1:54339/__reset");
    await page.goto(origin + "/login");
    console.log("Login page ready");
    await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("isolated-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/my-week");
    console.log("Owner logged in");
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await page
      .getByRole("button", { name: "+ Create project", exact: true })
      .click();
    await page.getByLabel("Project name").fill("Browser acceptance project");
    await page.getByLabel("Goal", { exact: true }).fill("Verify tracker flows");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("link", { name: "Browser acceptance project", exact: true })
      .click();
    await page
      .getByRole("button", { name: "+ Work package", exact: true })
      .click();
    await page.getByLabel("Work package name").fill("First work package");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("heading", { name: "First work package", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "+ Work package", exact: true })
      .click();
    await page.getByLabel("Work package name").fill("Second work package");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("heading", { name: "Second work package", exact: true })
      .waitFor();
    const lane = (name) =>
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
    const first = lane("First work package");
    await first
      .getByLabel("New task in First work package")
      .fill("Browser task");
    await first
      .locator('input[name="due_date"]')
      .fill(new Date().toLocaleDateString("en-CA"));
    await first.getByRole("button", { name: "Add task", exact: true }).click();
    await page
      .getByRole("button", { name: "Browser task", exact: true })
      .waitFor();
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("doing");
    await page.waitForTimeout(300);
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("blocked");
    const pane = page.getByRole("dialog");
    await pane.waitFor();
    await pane.getByRole("button", { name: "Save", exact: true }).click();
    await pane.getByRole("alert").waitFor();
    await pane
      .getByLabel("Blocked reason (required when blocked)")
      .fill("Waiting for review");
    await pane.getByRole("button", { name: "Save", exact: true }).click();
    await pane.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByLabel("Status for Browser task", { exact: true })
        .inputValue(),
      "blocked",
    );
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("done");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("todo");
    await page.waitForTimeout(300);
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("doing");
    await page.waitForTimeout(300);
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("blocked");
    await page.waitForTimeout(300);
    await page
      .getByLabel("Status for Browser task", { exact: true })
      .selectOption("done");
    await page.waitForTimeout(300);
    // Reopen completed task, edit it, and make it open for My week.
    await page
      .getByRole("button", { name: "Browser task", exact: true })
      .click();
    await pane.getByLabel("Status", { exact: true }).selectOption("doing");
    await pane
      .getByLabel("Notes", { exact: true })
      .fill("Browser edited notes");
    await pane.getByRole("button", { name: "Save", exact: true }).click();
    await pane.waitFor({ state: "hidden" });
    // Per-user view survives reload.
    await page.reload();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) =>
          b.textContent === "Board" &&
          b.getAttribute("aria-pressed") === "true",
      ),
    );
    await lane("Second work package")
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Second work package", exact: true })
      .waitFor({ state: "hidden" });
    await page.getByLabel("Show archived", { exact: true }).check();
    await page.getByRole("heading", { name: /Second work package/ }).waitFor();
    await page.getByRole("link", { name: "My week", exact: true }).click();
    await page.getByRole("button", { name: /Browser task/ }).waitFor();
    await page.getByRole("button", { name: "By project", exact: true }).click();
    await page
      .getByRole("heading", { name: "Browser acceptance project", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "By project", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Browser acceptance project", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Browser task", exact: true })
        .count(),
      1,
    );
    await page.screenshot({
      path: "/tmp/discovery-my-week.png",
      fullPage: true,
    });
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/projects");
      return r.json();
    });
    assert.equal(result.projects.length, 1);
    const id = result.projects[0].id;
    const details = await page.evaluate(
      async (id) => (await fetch("/api/projects/" + id)).json(),
      id,
    );
    assert.ok(details.events.some((e) => e.action === "archived"));
    assert.ok(
      details.events.filter((e) => e.action === "status_changed").length >= 8,
    );
    assert.ok(
      details.events.some((e) => e.to_value?.notes === "Browser edited notes"),
    );
    // Separate viewer session must have independent view storage and no writes.
    const viewer = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const vp = await viewer.newPage();
    await vp.goto(origin + "/login");
    await vp.getByLabel("Email", { exact: true }).fill("viewer@example.test");
    await vp
      .getByLabel("Password", { exact: true })
      .fill("isolated-test-password");
    await vp.getByRole("button", { name: "Sign in", exact: true }).click();
    await vp.waitForURL("**/my-week");
    assert.equal(
      await vp
        .getByRole("button", { name: "List", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await vp.goto(origin + "/projects/" + id);
    assert.equal(
      await vp
        .getByRole("button", { name: "Edit project", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await vp
        .getByRole("button", { name: "+ Work package", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await vp
        .getByLabel("Status for Browser task", { exact: true })
        .isDisabled(),
      true,
    );
    await vp.getByRole("button", { name: "Board", exact: true }).click();
    assert.equal(
      await vp
        .getByLabel("Status for Browser task", { exact: true })
        .isDisabled(),
      true,
    );
    await vp.getByRole("button", { name: "Browser task", exact: true }).click();
    assert.equal(
      await vp
        .getByRole("dialog")
        .getByRole("button", { name: "Save", exact: true })
        .isDisabled(),
      true,
    );
    await vp
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    const forbidden = await vp.evaluate(async () => {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Viewer forbidden" }),
      });
      return r.status;
    });
    assert.equal(forbidden, 403);
    await viewer.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: owner login lands on My week; project + two packages; quick add; all task statuses in list and board; reason pane; editing; archive visibility; events; week grouping/filtering; per-user view persistence; viewer list/board/pane and API denial.",
    );
  } catch (e) {
    console.log("URL:", page.url(), "Page errors:", errors);
    console.log((await page.locator("body").innerText()).slice(0, 1800));
    await page.screenshot({ path: "/tmp/discovery-tracker-failure.png" });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
