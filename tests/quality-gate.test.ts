import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json")) as {
  engines: { node: string };
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

test("local and Pages Node pins agree and installation rejects other versions", () => {
  assert.equal(read(".nvmrc").trim(), "24.21.0");
  assert.equal(pkg.engines.node, read(".nvmrc").trim());
  assert.match(read(".npmrc"), /^engine-strict=true$/m);
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.packages[""].engines.node, pkg.engines.node);
});

test("verification checks application and test types before the existing build gates", () => {
  assert.equal(pkg.scripts.check, "astro check && npm run check:rum");
  assert.equal(pkg.scripts["check:rum"], "tsc -p tsconfig.rum.json");
  const rumTypes = JSON.parse(read("tsconfig.rum.json"));
  assert.deepEqual(rumTypes.include, ["server/**/*.ts", "functions/**/*.ts"]);
  assert.equal(rumTypes.compilerOptions.strict, true);
  assert.equal(pkg.scripts.verify, "npm run check && npm test && npm run build");
  for (const dependency of ["@astrojs/check", "typescript", "@types/node"]) {
    assert.ok(pkg.devDependencies[dependency]);
  }
  const config = JSON.parse(read("tsconfig.json"));
  assert.equal(config.extends, "astro/tsconfigs/strict");
  assert.deepEqual(config.include, [".astro/types.d.ts", "**/*"]);
  assert.deepEqual(config.exclude, ["dist", "node_modules", ".codex-artifacts"]);
  for (const gate of ["generate:assets", "prepare:covers", "prune:media", "check:links", "check:modules", "check:performance", "check:built-tests"]) {
    assert.ok(pkg.scripts.build.includes(`npm run ${gate}`));
  }
});

for (const failure of ["check", "test", "none"]) {
  test(`verification short-circuits at ${failure === "none" ? "no stage" : failure}`, () => {
    const root = mkdtempSync(join(tmpdir(), "quality-gate-"));
    try {
      const stage = (name: string) => `node -e "console.log('${name.toUpperCase()}'); process.exit(${failure === name ? 1 : 0})"`;
      writeFileSync(join(root, "package.json"), JSON.stringify({
        private: true,
        scripts: { verify: pkg.scripts.verify, check: stage("check"), test: stage("test"), build: stage("build") }
      }));
      const result = spawnSync("npm", ["run", "verify", "--silent"], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, failure === "none" ? 0 : 1, result.stderr);
      const stages = result.stdout.split("\n").filter(line => /^(CHECK|TEST|BUILD)$/.test(line));
      assert.deepEqual(stages, failure === "check" ? ["CHECK"] : failure === "test" ? ["CHECK", "TEST"] : ["CHECK", "TEST", "BUILD"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
