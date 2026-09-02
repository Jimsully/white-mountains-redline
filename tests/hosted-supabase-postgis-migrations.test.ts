import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");

const postgisFunctionNames = [
  "geometrytype",
  "st_asgeojson",
  "st_equals",
  "st_geomfromgeojson",
  "st_isempty",
  "st_isvalid",
  "st_setsrid",
];

const expectedPostgisUsageByMigration: Record<string, string[]> = {
  "001_init.sql": ["extensions.geometry"],
  "002_source_trail_features.sql": ["extensions.geometry"],
  "003_api_projection_and_source_load.sql": [
    "extensions.st_asgeojson",
    "extensions.st_geomfromgeojson",
    "extensions.st_setsrid",
  ],
  "006_segment_construction_workspace.sql": ["extensions.geometry"],
  "008_verified_publication.sql": [
    "extensions.st_asgeojson",
    "extensions.st_equals",
    "extensions.st_geomfromgeojson",
    "extensions.st_setsrid",
  ],
  "011_reviewed_evidence_materialization.sql": [
    "extensions.geometry",
    "extensions.geometrytype",
    "extensions.st_equals",
    "extensions.st_geomfromgeojson",
    "extensions.st_isempty",
    "extensions.st_isvalid",
    "extensions.st_setsrid",
  ],
};

function readMigrations() {
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      sql: fs.readFileSync(path.join(migrationsDir, file), "utf8"),
    }));
}

function stripNonExecutableSql(sql: string) {
  return sql
    .replace(/--[^\r\n]*/g, "")
    .replace(/'([^']|'')*'/g, "''");
}

function unqualifiedFunctionCalls(sql: string) {
  const stripped = stripNonExecutableSql(sql);
  const names = postgisFunctionNames.join("|");
  return [...stripped.matchAll(new RegExp(`(?<![\\w.])(${names})\\s*\\(`, "gi"))]
    .map((match) => match[1].toLowerCase());
}

function unqualifiedPostgisTypes(sql: string) {
  const stripped = stripNonExecutableSql(sql);
  return [...stripped.matchAll(/(?<![\w.])(geometry|geography)\s*\(/gi)]
    .map((match) => match[1].toLowerCase());
}

describe("hosted Supabase PostGIS migration compatibility", () => {
  it("documents every migration that uses PostGIS functions or types", () => {
    const actualUsage = Object.fromEntries(readMigrations()
      .map(({ file, sql }) => {
        const stripped = stripNonExecutableSql(sql).toLowerCase();
        const usages = [
          ...new Set([
            ...[...stripped.matchAll(/extensions\.(geometry|geography)\s*\(/g)].map((match) => `extensions.${match[1]}`),
            ...postgisFunctionNames
              .filter((name) => stripped.includes(`extensions.${name}(`))
              .map((name) => `extensions.${name}`),
          ]),
        ].sort();
        return [file, usages];
      })
      .filter(([, usages]) => usages.length > 0));

    expect(actualUsage).toEqual(expectedPostgisUsageByMigration);
  });

  it("does not rely on extensions being present in search_path for PostGIS functions or types", () => {
    const violations = readMigrations().flatMap(({ file, sql }) => [
      ...unqualifiedFunctionCalls(sql).map((name) => `${file}: unqualified ${name}(...)`),
      ...unqualifiedPostgisTypes(sql).map((name) => `${file}: unqualified ${name}(...) type`),
    ]);

    expect(violations).toEqual([]);
  });

  it("keeps SECURITY DEFINER functions independent of extension search_path changes", () => {
    const securityDefinerFunctions = readMigrations().flatMap(({ file, sql }) => (
      [...sql.matchAll(/create or replace function[\s\S]*?\$\$;/gi)]
        .map((match) => match[0])
        .filter((body) => /security\s+definer/i.test(body))
        .map((body) => ({ file, body }))
    ));

    for (const { file, body } of securityDefinerFunctions) {
      expect(body, file).not.toMatch(/set\s+search_path\s*=\s*[^;]*\bextensions\b/i);
      expect(unqualifiedFunctionCalls(body), file).toEqual([]);
      expect(unqualifiedPostgisTypes(body), file).toEqual([]);
    }
  });
});
