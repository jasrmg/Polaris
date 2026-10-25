/**
 * Checks the code examples in the content files.
 *
 *  - Bicep: compiled with the Bicep CLI (`bicep build`). Set BICEP_PATH or
 *    put `bicep` on your PATH. Without it the Bicep check is skipped.
 *  - ARM: must parse as JSON and look like a deployment template.
 *
 * Run with: npm run check:snippets
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resources } from "../src/content";

const bicepPath = process.env.BICEP_PATH ?? "bicep";
const hasBicep = spawnSync(bicepPath, ["--version"]).status === 0;

if (!hasBicep) {
  console.warn(
    `! Bicep CLI not found ("${bicepPath}"). Skipping Bicep checks. Set BICEP_PATH to enable them.`,
  );
}

const dir = mkdtempSync(join(tmpdir(), "polaris-snippets-"));
const failures: string[] = [];
let bicepCount = 0;
let armCount = 0;

for (const r of resources) {
  const { bicep, arm } = r.example;

  if (bicep && hasBicep) {
    const file = join(dir, `${r.slug}.bicep`);
    writeFileSync(file, bicep);
    const result = spawnSync(
      bicepPath,
      ["build", file, "--outfile", join(dir, `${r.slug}.bicep.json`)],
      { encoding: "utf8" },
    );
    bicepCount++;
    // Warnings are fine. Errors set a non-zero exit code.
    if (result.status !== 0) {
      failures.push(`${r.slug} (bicep):\n${result.stderr || result.stdout}`);
    }
  }

  if (arm) {
    armCount++;
    try {
      const parsed = JSON.parse(arm) as Record<string, unknown>;
      if (typeof parsed.$schema !== "string" || !Array.isArray(parsed.resources)) {
        failures.push(`${r.slug} (arm): missing $schema or resources array`);
      }
    } catch (error) {
      failures.push(`${r.slug} (arm): ${(error as Error).message}`);
    }
  }
}

rmSync(dir, { recursive: true, force: true });

console.log(
  `Checked ${resources.length} resources: ${bicepCount} Bicep, ${armCount} ARM.`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log("All snippets OK.");
