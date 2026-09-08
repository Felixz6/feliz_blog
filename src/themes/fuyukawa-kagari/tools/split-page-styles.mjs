import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const directory = path.resolve("src/themes/fuyukawa-kagari/styles");
const innerClass = /^(?:blog-|post-|compact-post-|timeline-|page-title|works-|about-|article|prose$|meta-row$|tag-row$|game-|back-link$|not-found|archive-|workshop-|playroom-|memory-album|album-|lost-|manga-page-stamp)/;
for (const name of ["refresh", "manga"]) {
  const file = path.join(directory, `${name}.css`);
  const target = path.join(directory, `${name}-pages.css`);
  try {
    await fs.access(target);
    throw new Error(`${target} already exists; this one-time split must not run twice`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const source = await fs.readFile(file, "utf8");
  const sheet = postcss.parse(source);
  const pages = postcss.root();
  const move = (container, output) => {
    for (const node of [...container.nodes]) {
      if (node.type === "atrule" && node.nodes && node.name === "media") {
        const media = node.clone({ nodes: [] });
        move(node, media);
        if (media.nodes.length) output.append(media);
        if (!node.nodes.length) node.remove();
      } else if (node.type === "rule") {
        const names = [];
        selectorParser((selectors) => selectors.walkClasses((value) => names.push(value.value))).processSync(node.selector);
        if (names.length && names.every((value) => innerClass.test(value))) {
          output.append(node.clone());
          node.remove();
        }
      }
    }
  };
  move(sheet, pages);
  // Preserve the input file's line-ending convention during this mechanical split.
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const serialize = (value) => value.toString().replace(/\r?\n/g, newline);
  await fs.writeFile(file, serialize(sheet));
  await fs.writeFile(target, `/* Inner-page presentation; intentionally absent from Home. */${newline}${serialize(pages)}${newline}`);
  console.log(`${name}: moved ${pages.toString().length} characters to inner pages`);
}
