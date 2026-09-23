import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
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

test("CTF Notes project is published and exposes its eight Web notes", () => {
  const notesProject = projectEntries.find((project) => project.id === "ctf-notes");

  assert.ok(notesProject);
  assert.equal(notesProject.line, "ctf");
  assert.equal(notesProject.href, "/projects/ctf-notes/");
  assert.equal(notesProject.status, "已发布，8 篇 Web CTF 笔记");

  const noteFiles = readdirSync(new URL("../src/content/ctf-notes/", import.meta.url))
    .filter((file) => file.endsWith(".md"));
  assert.equal(noteFiles.length, 8);

  const indexPage = readFileSync(new URL("../src/pages/projects/ctf-notes/index.astro", import.meta.url), "utf8");
  const detailPage = readFileSync(new URL("../src/pages/projects/ctf-notes/[slug].astro", import.meta.url), "utf8");
  assert.match(indexPage, /ctfNotes/);
  assert.match(detailPage, /render\(note\)/);
});
