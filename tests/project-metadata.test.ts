import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { z } from "astro/zod";
import { projectIds, projectMetadata } from "../src/core/data/project-metadata.ts";
import { projectEntries } from "../src/core/data/projects.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared project metadata preserves IDs, display names and public paths", () => {
  assert.deepEqual(projectIds, ["src-skill", "recon-mcp"]);
  assert.deepEqual(projectMetadata, {
    "src-skill": { id: "src-skill", name: "SRC Skill", href: "/projects/src-skill/", docsHref: "/projects/src-skill/docs/" },
    "recon-mcp": { id: "recon-mcp", name: "Recon MCP", href: "/projects/recon-mcp/", docsHref: "/projects/recon-mcp/docs/" }
  });
});

test("the content schema accepts exactly the shared project IDs", () => {
  assert.match(read("src/content.config.ts"), /project: z\.enum\(projectIds\)/);
  const schema = z.enum(projectIds);
  for (const id of projectIds) assert.equal(schema.parse(id), id);
  for (const id of ["clown-src-6k-skill", "unknown", "", "ctf-notes"]) {
    assert.equal(schema.safeParse(id).success, false);
  }
});

test("all project documents keep their routes and ordered collection identities", () => {
  const routes = [];
  for (const id of projectIds) {
    const dir = new URL(`../src/content/project-docs/${id}/`, import.meta.url);
    const docs = readdirSync(dir).filter((file) => file.endsWith(".md")).map((file) => {
      const frontmatter = readFileSync(new URL(file, dir), "utf8").split("---")[1];
      assert.equal(frontmatter.match(/^project: (.+)$/m)?.[1], id);
      return { slug: frontmatter.match(/^routeSlug: (.+)$/m)?.[1], order: Number(frontmatter.match(/^order: (.+)$/m)?.[1]) };
    }).sort((a, b) => a.order - b.order);
    for (const doc of docs) routes.push(`${projectMetadata[id].docsHref}${doc.slug}/`);
  }
  assert.deepEqual(routes, [
    "/projects/src-skill/docs/overview/", "/projects/src-skill/docs/deployment/",
    "/projects/src-skill/docs/structure/", "/projects/recon-mcp/docs/overview/"
  ]);
});

test("project cards retain their existing identities while sharing names and links", () => {
  for (const [cardId, projectId] of [["security-research", "src-skill"], ["recon-tools", "recon-mcp"]] as const) {
    const card = projectEntries.find((entry) => entry.id === cardId);
    assert.ok(card);
    assert.equal(card.title, projectMetadata[projectId].name);
    assert.equal(card.href, projectMetadata[projectId].href);
    assert.ok(card.details.some((detail: string) => detail === projectId));
  }
});

test("document routes use shared metadata without taking queries out of their routes", () => {
  const index = read("src/pages/projects/[project]/docs/index.astro");
  const detail = read("src/pages/projects/[project]/docs/[slug].astro");
  assert.match(index, /projectIds\.map\(\(id\)/);
  assert.match(index, /projectMetadata\[id\]/);
  assert.match(index, /getCollection\("projectDocs"\)/);
  assert.match(index, /filter\(\(document\) => document\.data\.project === id\)/);
  assert.match(index, /sort\(\(a, b\) => a\.data\.order - b\.data\.order\)/);
  assert.match(detail, /projectMetadata\[document\.data\.project\]/);
  assert.match(detail, /getCollection\("projectDocs"\)/);
  assert.match(detail, /backHref=\{project\.docsHref\}/);
  assert.match(detail, /finishHref=\{project\.href\}/);
  for (const source of [index, detail]) {
    assert.doesNotMatch(source, /"SRC Skill"|"Recon MCP"|projectLabels/);
  }
});
