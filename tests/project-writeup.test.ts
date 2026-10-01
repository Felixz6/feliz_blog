import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { projectEntries, projectTechLines } from "../src/core/data/projects.ts";

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

test("all CTF Notes have a single optional embedded title and visible, gap-free section levels", () => {
  const notesDir = new URL("../src/content/ctf-notes/", import.meta.url);
  const noteFiles = readdirSync(notesDir).filter((file) => file.endsWith(".md"));

  for (const file of noteFiles) {
    const source = readFileSync(new URL(file, notesDir), "utf8");
    const headings: number[] = [];
    let inFence = false;

    for (const line of source.split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const heading = /^(#{1,6})\s+/.exec(line);
      if (heading) headings.push(heading[1].length);
    }

    assert.ok(headings.length > 0, `${file} needs headings`);
    assert.ok(headings.filter((level) => level === 1).length <= 1, `${file} has duplicate page-level headings`);
    assert.ok(headings.every((level) => [1, 2, 3].includes(level)), `${file} contains headings hidden from the CTF TOC`);
    for (let index = 1; index < headings.length; index += 1) {
      assert.ok(headings[index] <= headings[index - 1] + 1, `${file} skips a heading level at item ${index + 1}`);
    }
  }
});

test("the Open Source line contains four detailed GitHub project cards instead of its placeholder", () => {
  const expected = [
    ["open-source-eisland-lite", "https://github.com/Felixz6/eisland-lite"],
    ["open-source-rime-sukura", "https://github.com/Felixz6/Rime-sukura"],
    ["open-source-adsdk-agent", "https://github.com/Felixz6/ADSDK-Agent"],
    ["open-source-mobile-vscode", "https://github.com/Felixz6/MobileVSCode"]
  ];
  const openSourceProjects = projectEntries.filter((project) => project.line === "open-source");

  assert.equal(openSourceProjects.length, 4);
  for (const [id, href] of expected) {
    const project = openSourceProjects.find((entry) => entry.id === id);
    assert.ok(project, `missing ${id}`);
    assert.equal(project.href, href);
    assert.equal(project.linkLabel, href.replace("https://", ""));
    assert.ok(project.summary.length > 80, `${id} needs a detailed description`);
    assert.equal("status" in project, false);
  }

  const projectsPage = readFileSync(new URL("../src/themes/fuyukawa-kagari/pages/ProjectsPage.astro", import.meta.url), "utf8");
  assert.match(projectsPage, /target=\{project\.isExternal \? "_blank" : undefined\}/);
  assert.match(projectsPage, /rel=\{project\.isExternal \? "noopener noreferrer" : undefined\}/);
  assert.match(projectsPage, /project\.isExternal \? "tabler:external-link"/);
  assert.doesNotMatch(openSourceProjects.map((project) => "status" in project ? project.status : "").join(" "), /占位/);
});

test("SRC research and recon projects are listed under Web Security", () => {
  const srcResearch = projectEntries.find((project) => project.id === "security-research");
  const reconMcp = projectEntries.find((project) => project.id === "recon-tools");

  assert.ok(srcResearch);
  assert.equal(srcResearch.title, "SRC Skill");
  assert.equal(srcResearch.line, "web-security");
  assert.ok(srcResearch.details.includes("src-skill"));
  assert.equal("status" in srcResearch, false);
  assert.equal(srcResearch.href, "/projects/src-skill/");
  assert.equal(srcResearch.linkLabel, "查看项目详情");

  assert.ok(reconMcp);
  assert.equal(reconMcp.title, "Recon MCP");
  assert.equal(reconMcp.line, "web-security");
  assert.ok(reconMcp.details.includes("recon-mcp"));
  assert.equal("status" in reconMcp, false);
  assert.equal(reconMcp.href, "/projects/recon-mcp/");
  assert.equal(reconMcp.linkLabel, "查看项目详情");

  const projectsPage = readFileSync(new URL("../src/themes/fuyukawa-kagari/pages/ProjectsPage.astro", import.meta.url), "utf8");
  assert.doesNotMatch(projectsPage, /下一步会把相关笔记/);
  assert.doesNotMatch(projectsPage, /works-card-status p/);

  const srcPage = readFileSync(new URL("../src/pages/projects/src-skill/index.astro", import.meta.url), "utf8");
  const reconPage = readFileSync(new URL("../src/pages/projects/recon-mcp/index.astro", import.meta.url), "utf8");
  assert.match(srcPage, /projectMetadata\["src-skill"\]/);
  assert.match(srcPage, /title=\{project\.name\}/);
  assert.match(srcPage, /MCP 服务源码/);
  assert.match(reconPage, /projectMetadata\["recon-mcp"\]/);
  assert.match(reconPage, /title=\{project\.name\}/);
  assert.match(reconPage, /asset_search/);
});

test("Web Development category and Personal Blog placeholder are removed", () => {
  assert.equal(projectTechLines.map((line): string => line.key).includes("web-development"), false);
  assert.equal(projectEntries.map((project): string => project.id).includes("personal-blog"), false);
  assert.equal(projectEntries.map((project): string => project.line).includes("web-development"), false);
});

test("empty AI project placeholder and filter are not published", () => {
  assert.equal(projectEntries.map((project): string => project.id).includes("ai-experiments"), false);
  assert.equal(projectTechLines.map((line): string => line.key).includes("ai"), false);
});

test("Projects category summary row is removed while project filters remain", () => {
  const projectsPage = readFileSync(new URL("../src/themes/fuyukawa-kagari/pages/ProjectsPage.astro", import.meta.url), "utf8");
  const pageStyles = readFileSync(new URL("../src/themes/fuyukawa-kagari/styles/refresh-pages.css", import.meta.url), "utf8");
  const sharedStyles = readFileSync(new URL("../src/themes/fuyukawa-kagari/styles/refresh.css", import.meta.url), "utf8");

  assert.doesNotMatch(projectsPage, /works-tech-board|data-line-card|lineCards/);
  assert.doesNotMatch(pageStyles, /works-tech-board/);
  assert.doesNotMatch(sharedStyles, /works-tech-board/);
  assert.match(projectsPage, /data-works-filter/);
  assert.match(projectsPage, /data-project-line/);
});
