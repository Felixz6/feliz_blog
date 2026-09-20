import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = fileURLToPath(new URL("../scripts/check-built-modules.mjs", import.meta.url));

function check(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "yuimi-built-modules-"));
  mkdirSync(join(root, "_astro"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(root, "_astro", name), content);
    }
    return spawnSync(process.execPath, ["--experimental-vm-modules", checker, root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("Production modules reject the raw TypeScript import that broke Works", () => {
  const result = check({ "worksPage.hash.js": 'import { bindVideoStill } from "./videoStill.ts";' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid browser module .\/videoStill.ts/);
});

test("Production modules reject missing JavaScript dependencies", () => {
  const result = check({ "worksPage.hash.js": 'import "./missing.js";' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing module .\/missing.js/);
});

test("Production modules resolve hashed dependencies without evaluating browser code", () => {
  const result = check({
    "worksPage.hash.js": 'import "./still.hash.js"; window.addEventListener("load", () => {});',
    "still.hash.js": 'export const value = document.hidden;',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 parsed, 1 local static imports resolved/);
});
