// Runs actual Next pages/API handlers against PostgreSQL RLS in an isolated
// Supabase protocol fixture. Test identities/data never reach the hosted app.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";

const children = [];
const configs = ["tsconfig.json", "next-env.d.ts"].map((path) => [
  path,
  readFileSync(path),
]);
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  return child;
}
async function ready(url, child) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited: ${url}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await pause(500);
  }
  throw new Error(`Test server did not become ready: ${url}`);
}
async function run(file) {
  const child = start([file], { AUTH_TEST_ORIGIN: "http://127.0.0.1:3035" });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Test timed out: ${file}`));
    }, 120000);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`${file} exited ${code}`));
    });
  });
}
try {
  const fixture = start(["scripts/fixtures/tracker-supabase.mjs"]);
  await ready("http://127.0.0.1:54339/__inspect", fixture);
  const app = start(
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3035",
    ],
    {
      DISCOVERY_TEST_DIST_DIR: ".next-tracker-test",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54339",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "isolated-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "",
      OPENAI_API_KEY: "",
    },
  );
  await ready("http://127.0.0.1:3035/login", app);
  if (
    !process.env.TRACKER_RESOURCES_ONLY &&
    !process.env.TRACKER_NOTES_ONLY &&
    !process.env.TRACKER_SEND_ONLY
  ) {
    await run("scripts/fixtures/tracker-browser.mjs");
    await run("scripts/fixtures/tracker-week-browser.mjs");
  }
  if (!process.env.TRACKER_RESOURCES_ONLY && !process.env.TRACKER_NOTES_ONLY)
    await run("scripts/fixtures/discovery-send-browser.mjs");
  if (!process.env.TRACKER_RESOURCES_ONLY)
    await run("scripts/fixtures/tracker-notes-browser.mjs");
  await run("scripts/fixtures/project-resources-browser.mjs");
  await run("scripts/fixtures/tracker-reorder-browser.mjs");
  await run("scripts/fixtures/project-updates-browser.mjs");
  await run("scripts/check-signed-out.mjs");
  console.log("PASS: isolated tracker browser/API/RLS acceptance suite.");
} finally {
  await Promise.all(
    children
      .filter((c) => c.exitCode === null)
      .map(
        (child) =>
          new Promise((resolve) => {
            child.once("exit", resolve);
            child.kill("SIGTERM");
          }),
      ),
  );
  // Next automatically rewrites these for its alternate test build directory.
  // Restore the original project configuration once the fixture has stopped.
  for (const [path, content] of configs) writeFileSync(path, content);
}
