import { readFileSync } from "node:fs";
import ts from "typescript";
function url(file, imports = {}) {
  let code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  for (const [name, value] of Object.entries(imports))
    code = code.replaceAll(`from "${name}"`, `from "${value}"`);
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const types = url("lib/tracker/types.ts"),
  validation = url("lib/tracker/validation.ts", {
    "./types": types,
    zod: import.meta.resolve("zod"),
  });
const csv = url("lib/tracker/csv.ts", {
  "./validation": validation,
  zod: import.meta.resolve("zod"),
});
export async function importModules() {
  return {
    ...(await import(csv)),
    ...(await import(url("lib/tracker/csv-template.ts", { "./csv": csv }))),
  };
}
