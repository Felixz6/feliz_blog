import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const blogDir = new URL("../src/content/blog/", import.meta.url);
const notesDir = new URL("../src/content/risc-v-notes/", import.meta.url);
const coverPath = new URL("../public/blog-covers/cover-11.webp", import.meta.url);
const chapters = [
  "risc-v-00-basics",
  "risc-v-01-computer-organization",
  "risc-v-02-binary-and-twos-complement",
  "risc-v-03-registers",
  "risc-v-04-instruction-reference",
  "risc-v-05-assembly-lab",
  "risc-v-06-gcc-and-qemu",
  "risc-v-07-xv6-source-tour",
  "risc-v-08-xv6-boot",
  "risc-v-09-xv6-process-management",
  "risc-v-10-xv6-virtual-memory",
  "risc-v-11-xv6-syscalls-and-traps",
  "risc-v-12-xv6-filesystem"
];
const readPost = (slug: string) => readFileSync(new URL(`${slug}.md`, blogDir), "utf8");
const readNote = (slug: string) => readFileSync(new URL(`${slug}.md`, notesDir), "utf8");

test("Blog archive exposes one RISC-V series entrance while all 13 chapters use the selected cover", () => {
  assert.equal(existsSync(coverPath), true);
  assert.deepEqual(
    readdirSync(blogDir).filter((name) => name.startsWith("risc-v-")).sort(),
    ["risc-v-xv6-learning-notes.md"]
  );
  const index = readPost("risc-v-xv6-learning-notes");
  assert.match(index, /title: "RISC-V 学习笔记：从机器指令到 xv6"/);
  assert.match(index, /cover: "\/blog-covers\/cover-11\.webp"/);
  for (const slug of chapters) {
    assert.match(index, new RegExp(`/risc-v-notes/${slug}/`));
    const chapter = readNote(slug);
    assert.match(chapter, new RegExp(`slug: ${slug}`));
    assert.match(chapter, /cover: "\/blog-covers\/cover-11\.webp"/);
    assert.match(chapter, /category: "tech"/);
    assert.match(chapter, /## /);
    assert.doesNotMatch(chapter, /\]\([^)]*\.md(?:#[^)]*)?\)/);
    assert.doesNotMatch(chapter, /\/blog\/risc-v-/);
  }
});

test("chapter routes render the separate collection and return readers to the series choices", () => {
  const route = readFileSync(new URL("../src/pages/risc-v-notes/[slug].astro", import.meta.url), "utf8");
  const contentSchema = readFileSync(new URL("../src/content.config.ts", import.meta.url), "utf8");
  const articlePage = readFileSync(new URL("../src/themes/fuyukawa-kagari/pages/ArticlePage.astro", import.meta.url), "utf8");
  const articleLayout = readFileSync(new URL("../src/themes/fuyukawa-kagari/layouts/ArticleLayout.astro", import.meta.url), "utf8");
  assert.match(contentSchema, /riscVNotes = defineCollection/);
  assert.match(route, /getCollection\("riscVNotes"\)/);
  assert.match(route, /archiveHref="\/blog\/risc-v-xv6-learning-notes\/"/);
  assert.match(route, /archiveLabel="回到学习目录"/);
  assert.match(articlePage, /archiveHref/);
  assert.match(articleLayout, /href=\{returnHref\}/);
});
