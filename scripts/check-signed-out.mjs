import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const origin = process.env.AUTH_TEST_ORIGIN ?? "http://127.0.0.1:3033";
let count = 0;
async function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    if (!["page.tsx", "route.ts"].includes(entry.name)) continue;
    const route = "/" + path.dirname(file).replace(/^app\/?/, "").replace(/\[[^\]]+\]/g, "00000000-0000-0000-0000-000000000001");
    if (route === "/login") continue;
    const methods = entry.name === "route.ts"
      ? Array.from(readFileSync(file, "utf8").matchAll(/export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(/g), m => m[1])
      : ["GET"];
    for (const method of methods) {
      const res = await fetch(origin + route, { method, redirect: "manual" });
      if (route.startsWith("/api/")) assert.equal(res.status, 401, `${method} ${route}`);
      else {
        assert.equal(res.status, 307, `${method} ${route}`);
        assert.equal(new URL(res.headers.get("location"), origin).pathname, "/login");
      }
      assert.match(res.headers.get("cache-control"), /no-store/);
      count++;
    }
  }
}
await walk("app");
const login = await fetch(origin + "/login");
assert.equal(login.status, 200);
assert.match(await login.text(), /Sign in to DiscoveryOS/);
console.log(`PASS: ${count} signed-out route/method checks; login is accessible.`);
