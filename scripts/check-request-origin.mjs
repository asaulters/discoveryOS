import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync("lib/requestOrigin.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { requestOrigin } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
for (const [url, host, expected] of [
  ["http://localhost:3033/auth/signout", "127.0.0.1:3033", "http://127.0.0.1:3033"],
  ["http://localhost:3033/auth/signout", "localhost:3033", "http://localhost:3033"],
  ["https://internal/auth/signout", "discovery.example.com", "https://discovery.example.com"],
  ["http://localhost:3033/auth/signout", "[::1]:3033", "http://[::1]:3033"],
  ["https://discovery.example.com/auth/signout", null, "https://discovery.example.com"],
]) {
  const headers = new Headers(host ? { host } : {});
  const actual = requestOrigin({ url, headers });
  assert.equal(actual, expected);
  assert.equal(new URL("/login", actual).origin, expected);
  assert.notEqual(actual, "https://attacker.example.com");
  const otherPort = new URL(expected);
  otherPort.port = "9999";
  assert.notEqual(actual, otherPort.origin);
}
console.log("PASS: request origins and login redirects preserve browser host; foreign origins and ports differ.");
