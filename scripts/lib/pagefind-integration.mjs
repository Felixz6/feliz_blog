import * as defaultPagefind from "pagefind";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{
 *   addDirectory: (options: { path: string, glob: string }) => Promise<{ page_count?: number, errors: string[] }>,
 *   writeFiles: (options: { outputPath: string }) => Promise<{ errors: string[] }>
 * }} BuildIndex
 * @param {{ createIndex: (options: { forceLanguage: string, includeCharacters: string }) => Promise<{ index?: BuildIndex, errors: string[] }>, close: () => Promise<unknown> }} [pagefind]
 */
export const pagefindIntegration = (pagefind = defaultPagefind) => ({
  name: "site-pagefind",
  hooks: {
    "astro:build:done": async ({ dir, logger }) => {
      try {
        const { index, errors } = await pagefind.createIndex({
          forceLanguage: "zh",
          includeCharacters: "_-:"
        });

        if (!index || errors.length) {
          throw new Error(`Pagefind index was not created: ${errors.join(", ") || "missing index"}`);
        }

        const distDir = fileURLToPath(dir);
        const addResult = await index.addDirectory({
          path: distDir,
          glob: "**/*.html"
        });

        if (!Number.isFinite(addResult.page_count) || addResult.page_count <= 0) {
          throw new Error(`Pagefind indexing failed: ${addResult.errors.join(", ") || "no pages indexed"}`);
        }

        if (addResult.errors.length) {
          logger.warn(`Pagefind indexing warnings: ${addResult.errors.join(", ")}`);
        }

        const writeResult = await index.writeFiles({
          outputPath: fileURLToPath(new URL("./pagefind", dir))
        });

        if (writeResult.errors.length) {
          throw new Error(`Pagefind index write failed: ${writeResult.errors.join(", ")}`);
        } else {
          logger.info(`Pagefind indexed ${addResult.page_count} pages.`);
        }

      } finally {
        await pagefind.close();
      }
    }
  }
});
