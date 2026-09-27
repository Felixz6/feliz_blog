import { readFile } from "node:fs/promises";

const expressiveCodeDomCopyPlugin = {
  name: "feliz-expressive-code-dom-copy",
  jsModules: async () => [
    await readFile(new URL("./expressive-code-dom-copy-client.js", import.meta.url), "utf8")
  ]
};

export default expressiveCodeDomCopyPlugin;
