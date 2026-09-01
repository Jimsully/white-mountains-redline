import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const loaderScripts = [
  "scripts/load-publication.ts",
  "scripts/load-reviewed-evidence.ts",
] as const;

function hasTopLevelAwait(sourceText: string, fileName: string) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;

  function visit(node: ts.Node) {
    if (ts.isAwaitExpression(node) && !isInsideFunctionLike(node)) found = true;
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function isInsideFunctionLike(node: ts.Node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) return true;
    current = current.parent;
  }
  return false;
}

function smoke(loaderScript: string) {
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return spawnSync(process.execPath, ["scripts/run-tsx.cjs", loaderScript], {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

describe("loader CLI entrypoints", () => {
  it("keep async work inside function scope for the CJS tsx runner", () => {
    for (const script of loaderScripts) {
      const source = fs.readFileSync(path.join(root, script), "utf8");
      expect(hasTopLevelAwait(source, script), script).toBe(false);
    }
  });

  it("reaches publication loader usage validation through run-tsx", () => {
    const result = smoke("scripts/load-publication.ts");
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("Usage: npm run data:publication:load -- --artifact <verified-network-artifact-path>");
    expect(output).not.toContain("Top-level await is currently not supported");
  });

  it("reaches reviewed-evidence loader usage validation through run-tsx", () => {
    const result = smoke("scripts/load-reviewed-evidence.ts");
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("Usage: npm run data:activity:evidence:load -- --artifact <activity-match-artifact> --decisions <review-export> --user-id <auth-user-uuid> [--load]");
    expect(output).not.toContain("Top-level await is currently not supported");
  });
});
