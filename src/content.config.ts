import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).default([]),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(["tech", "anime", "life"]).default("tech"),
    draft: z.boolean().default(false)
  })
});

const riscVNotes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/risc-v-notes" }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(["tech", "anime", "life"]).default("tech")
  })
});

const ctfNotes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/ctf-notes" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().int().positive()
  })
});

const projectDocs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/project-docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    project: z.enum(["src-skill", "recon-mcp"]),
    routeSlug: z.string(),
    order: z.number().int().positive()
  })
});

export const collections = { blog, ctfNotes, projectDocs, riscVNotes };
