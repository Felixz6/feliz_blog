import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectInternalLinks } from "../scripts/check-internal-links.mjs";

test("built-site link checker accepts existing routes and percent-encoded anchors", async () => {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "internal-links-valid-"));
  try {
    await mkdir(path.join(distDir, "chapter"), { recursive: true });
    await writeFile(path.join(distDir, "index.html"), '<a href="/chapter/#目标">章节</a>');
    await writeFile(path.join(distDir, "chapter", "index.html"), '<h2 id="目标">标题</h2>');
    const result = await inspectInternalLinks({ distDir });
    assert.deepEqual(result.failures, []);
    assert.equal(result.htmlCount, 2);
    assert.equal(result.linkCount, 1);
    assert.equal(result.fragmentCount, 1);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test("built-site link checker reports missing routes and anchors but ignores script text", async () => {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "internal-links-invalid-"));
  try {
    await mkdir(path.join(distDir, "chapter"), { recursive: true });
    await writeFile(path.join(distDir, "index.html"), [
      '<a href="/missing/">missing page</a>',
      '<a href="/chapter/#absent">missing anchor</a>',
      '<script>const sample = \'<a href="/script-only/">\';</script>',
      '<a href="https://example.test/external/">external</a>'
    ].join("\n"));
    await writeFile(path.join(distDir, "chapter", "index.html"), '<h2 id="present">Title</h2>');
    const result = await inspectInternalLinks({ distDir });
    assert.equal(result.failures.length, 2);
    assert.match(result.failures[0], /missing internal target ".*\/missing\//);
    assert.match(result.failures[1], /missing anchor "#absent"/);
    assert.equal(result.linkCount, 2);
    assert.equal(result.fragmentCount, 1);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
