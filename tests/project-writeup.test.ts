import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { projectEntries } from "../src/core/data/projects.ts";

test("WHUCTF write-up appears in the CTF projects and links to its blog post", () => {
  const writeup = projectEntries.find((project) => project.id === "whuctf-lapsa-writeup");

  assert.ok(writeup);
  assert.equal(writeup.line, "ctf");
  assert.equal(writeup.href, "/blog/2026-whuctf-lapsa-writeup/");
  assert.equal(writeup.status, "已发布，可阅读全文");

  const page = readFileSync(new URL("../src/themes/fuyukawa-kagari/pages/ProjectsPage.astro", import.meta.url), "utf8");
  assert.match(page, /href=\{project\.href\}/);
  assert.match(page, /阅读完整 Writeup/);
});
