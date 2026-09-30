const projectNames = {
  "src-skill": "SRC Skill",
  "recon-mcp": "Recon MCP"
} as const;

export type ProjectId = keyof typeof projectNames;
export const projectIds = Object.keys(projectNames) as [ProjectId, ...ProjectId[]];

export const projectMetadata = Object.fromEntries(projectIds.map((id) => [id, {
  id,
  name: projectNames[id],
  href: `/projects/${id}/`,
  docsHref: `/projects/${id}/docs/`
}])) as Record<ProjectId, {
  id: ProjectId;
  name: string;
  href: string;
  docsHref: string;
}>;
