import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
import { importModules } from "./import-module.mjs";
const { PROJECT_CSV_TEMPLATE: csv } = await importModules();
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
  await page.goto(origin + "/projects");
  await page
    .getByRole("button", { name: "Import project CSV", exact: true })
    .click();
  const importer = page.getByRole("region", {
    name: "Import project CSV",
    exact: true,
  });
  const templateDownload = page.waitForEvent("download");
  await importer
    .getByRole("link", { name: "Download CSV template", exact: true })
    .click();
  const template = await templateDownload;
  assert.equal(readFileSync(await template.path(), "utf8"), csv);
  await importer.getByLabel("Project CSV", { exact: true }).setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "type,key,parent_key,name\nproject,p,,Project\ntask,t,missing,Task",
    ),
  });
  await importer.getByRole("alert").filter({ hasText: "parent_key" }).waitFor();
  assert.equal(
    await importer
      .getByRole("button", { name: "Create project from CSV", exact: true })
      .count(),
    0,
  );
  assert.equal(
    (
      await page.evaluate(
        async () => (await (await fetch("/api/projects")).json()).projects,
      )
    ).length,
    0,
  );
  // Formatting is local and requires review before any values are discarded.
  await importer.getByLabel("Project CSV", { exact: true }).setInputFiles({
    name: "needs-formatting.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Item Type,ID,Parent ID,Title,Order\nProject,p,,Formatted project,0\nWork Package,w,missing,Package,1",
    ),
  });
  await importer
    .getByRole("button", { name: "Format CSV", exact: true })
    .click();
  const formatter = importer.getByRole("region", {
    name: "CSV formatter",
    exact: true,
  });
  await formatter
    .getByText("Field does not apply to project", { exact: true })
    .waitFor();
  const useFormatted = formatter.getByRole("button", {
    name: "Use formatted CSV",
    exact: true,
  });
  assert.equal(await useFormatted.isEnabled(), false);
  await formatter.getByRole("checkbox").check();
  assert.equal(
    await useFormatted.isEnabled(),
    false,
    "Missing parents must still be fixed",
  );
  const editor = formatter.getByLabel("Formatted CSV (editable)", {
    exact: true,
  });
  await editor.fill(
    (await editor.inputValue()).replace(
      "work_package,w,missing,",
      "work_package,w,p,",
    ),
  );
  await formatter.getByRole("status").waitFor();
  const formattedDownload = page.waitForEvent("download");
  await formatter
    .getByRole("button", { name: "Download formatted CSV", exact: true })
    .click();
  assert.match(
    readFileSync(await (await formattedDownload).path(), "utf8"),
    /work_package,w,p,/,
  );
  await useFormatted.click();
  await importer
    .getByRole("heading", { name: "Preview: Formatted project", exact: true })
    .waitFor();
  assert.equal(
    (
      await page.evaluate(
        async () => (await (await fetch("/api/projects")).json()).projects,
      )
    ).length,
    0,
    "Formatting and preview never create projects",
  );
  await importer.getByLabel("Project CSV", { exact: true }).setInputFiles({
    name: "project.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await importer
    .getByRole("heading", { name: "Preview: Example project", exact: true })
    .waitFor();
  await importer
    .getByText("1 project · 1 work packages · 1 tasks · 2 subtasks", {
      exact: true,
    })
    .waitFor();
  let importBody;
  page.on("request", (r) => {
    if (r.url() === origin + "/api/projects/import" && r.method() === "POST")
      importBody = r.postDataJSON();
  });
  await importer
    .getByRole("button", { name: "Create project from CSV", exact: true })
    .click();
  await importer
    .getByRole("link", { name: "Open imported project", exact: true })
    .waitFor();
  const href = await importer
      .getByRole("link", { name: "Open imported project", exact: true })
      .getAttribute("href"),
    projectId = href.split("/").pop();
  const retried = await page.evaluate(async (body) => {
    const r = await fetch("/api/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  }, importBody);
  assert.equal(retried.status, 201);
  assert.equal(retried.data.project_id, projectId);
  assert.equal(retried.data.already_imported, true);
  await importer
    .getByRole("link", { name: "Open imported project", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Example project", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Validate the workflow", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Map approval steps", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", {
      name: "Complete subtask: Confirm backup owner",
      exact: true,
    })
    .waitFor();
  const resources = () =>
    page.getByRole("region", {
      name: "Project notes and resources",
      exact: true,
    });
  await resources()
    .getByText("Build notes and project context", { exact: true })
    .waitFor();
  await resources()
    .getByRole("button", { name: "Edit notes", exact: true })
    .click();
  await resources()
    .getByLabel("Project notes", { exact: true })
    .fill("Build notes\nUse the current slide deck");
  await resources().getByRole("button", { name: "Save", exact: true }).click();
  await resources()
    .getByText("Build notes\nUse the current slide deck", { exact: true })
    .waitFor();
  await resources()
    .getByRole("button", { name: "Add link", exact: true })
    .click();
  await resources()
    .getByLabel("Link name", { exact: true })
    .fill("Slide deck link");
  await resources()
    .getByLabel("Document URL", { exact: true })
    .fill("https://example.test/slides");
  await resources()
    .getByLabel("Description (optional)", { exact: true })
    .fill("Current deck");
  await resources()
    .getByRole("button", { name: "Save link", exact: true })
    .click();
  await resources().getByText("Slide deck link", { exact: true }).waitFor();
  assert.equal(
    await resources()
      .getByRole("link", { name: "Open link", exact: true })
      .getAttribute("href"),
    "https://example.test/slides",
  );
  const fileBytes = Buffer.from("Project build notes\nA real private file.");
  await resources()
    .getByRole("button", { name: "Attach file", exact: true })
    .click();
  await resources().getByLabel("Project file", { exact: true }).setInputFiles({
    name: "build-notes.txt",
    mimeType: "text/plain",
    buffer: fileBytes,
  });
  await resources()
    .getByRole("button", { name: "Upload file", exact: true })
    .click();
  await resources()
    .getByRole("button", { name: "Download", exact: true })
    .waitFor();
  const downloaded = page.waitForEvent("download");
  await resources()
    .getByRole("button", { name: "Download", exact: true })
    .click();
  const actual = await downloaded;
  assert.equal(actual.suggestedFilename(), "build-notes.txt");
  assert.deepEqual(readFileSync(await actual.path()), fileBytes);
  await page.reload();
  await resources()
    .getByText("Build notes\nUse the current slide deck", { exact: true })
    .waitFor();
  await resources()
    .getByRole("button", { name: "Download", exact: true })
    .waitFor();
  const files = await page.evaluate(
      async (id) => (await fetch(`/api/projects/${id}/resources`)).json(),
      projectId,
    ),
    file = files.find((f) => f.kind === "file");
  assert.equal(file.state, "ready");
  assert.equal(file.size_bytes, fileBytes.length);
  const anonymous = await fetch(
    `http://127.0.0.1:54339/storage/v1/object/public/project-files/${file.storage_path}`,
  );
  assert.equal(anonymous.status, 403);
  const fileRow = () =>
    resources().locator("li").filter({ hasText: "build-notes.txt" });
  await fileRow()
    .getByRole("button", { name: "Archive resource", exact: true })
    .click();
  await fileRow().waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(
      async ({ projectId, id }) =>
        (await fetch(`/api/projects/${projectId}/resources/${id}/download`))
          .status,
      { projectId, id: file.id },
    ),
    404,
  );
  await page.getByLabel("Show archived", { exact: true }).check();
  await fileRow()
    .getByRole("button", { name: "Restore resource", exact: true })
    .click();
  await fileRow()
    .getByRole("button", { name: "Download", exact: true })
    .waitFor();
  // A reserved but not uploaded object cannot be completed or downloaded.
  const pending = await page.evaluate(
    async (id) =>
      (
        await fetch(`/api/projects/${id}/resources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "file",
            name: "Incomplete.txt",
            size_bytes: 100,
          }),
        })
      ).json(),
    projectId,
  );
  assert.equal(
    await page.evaluate(
      async ({ projectId, id }) =>
        (
          await fetch(`/api/projects/${projectId}/resources/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "complete" }),
          })
        ).status,
      { projectId, id: pending.id },
    ),
    400,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login("viewer@example.test");
  await page.goto(origin + "/projects");
  assert.equal(
    await page
      .getByRole("button", { name: "Import project CSV", exact: true })
      .count(),
    0,
  );
  await page.goto(origin + href);
  await resources()
    .getByRole("button", { name: "Download", exact: true })
    .waitFor();
  assert.equal(
    await resources()
      .getByRole("button", { name: "Attach file", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await resources()
      .getByRole("button", { name: "Edit notes", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await resources()
      .getByRole("button", { name: "Archive resource", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await resources().getByText("Incomplete.txt", { exact: false }).count(),
    0,
  );
  const viewerDownload = page.waitForEvent("download");
  await resources()
    .getByRole("button", { name: "Download", exact: true })
    .click();
  assert.deepEqual(
    readFileSync(await (await viewerDownload).path()),
    fileBytes,
  );
  assert.equal(
    await page.evaluate(
      async (id) =>
        (
          await fetch(`/api/projects/${id}/resources`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "link",
              name: "No",
              url: "https://example.test",
            }),
          })
        ).status,
      projectId,
    ),
    403,
  );
  assert.equal(
    await page.evaluate(
      async (body) =>
        (
          await fetch("/api/projects/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        ).status,
      importBody,
    ),
    403,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: CSV template/preview/errors, full hierarchy creation and idempotent retry; project notes, links, real file upload/download, archive/restore, incomplete uploads, private objects and viewer read/download-only controls.",
  );
} finally {
  await browser.close();
}
