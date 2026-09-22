/** Stage the npm package in dist/npm: one Bun-targeted bundle (ink/react
 *  inlined, so installs pull no dependencies), a generated package.json,
 *  the root README with repo-absolute links, and the license.
 *  Usage: bun scripts/pack-npm.ts   then   npm publish dist/npm */

import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = join(import.meta.dir, "..");
const root = join(here, "..");
const out = join(here, "dist", "npm");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf-8"));
const REPO = "https://github.com/DEVxEAZY/atlas-cli";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const built = await Bun.build({
  entrypoints: [join(here, "src", "main.tsx")],
  target: "bun",
  plugins: [
    {
      // ink loads devtools only when DEV=true and the package is installed;
      // the bundler still inlines its static import, so stub it out
      name: "no-devtools",
      setup(build) {
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: "react-devtools-core",
          namespace: "stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export default { initialize() {}, connectToDevTools() {} };",
          loader: "js",
        }));
      },
    },
  ],
  define: { "process.env.NODE_ENV": '"production"' },
  banner: "#!/usr/bin/env bun",
  naming: "atlas.js",
  outdir: out,
});
if (!built.success) {
  for (const log of built.logs) console.error(log);
  process.exit(1);
}
chmodSync(join(out, "atlas.js"), 0o755);

writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "@devxeazy/atlas-cli",
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      repository: pkg.repository,
      homepage: pkg.homepage,
      bugs: pkg.bugs,
      keywords: pkg.keywords,
      type: "module",
      bin: { atlas: "atlas.js" },
      files: ["atlas.js"],
      engines: { bun: ">=1.4.2" },
      os: ["linux"],
      publishConfig: { access: "public" },
    },
    null,
    2,
  ) + "\n",
);

// relative links break on npmjs.com: point them at the repository
const readme = readFileSync(join(root, "README.md"), "utf-8").replace(
  /(!?)\[([^\]]*)\]\((?!https?:|#|mailto:)([^)\s]+)\)/g,
  (_m, bang: string, text: string, path: string) =>
    `${bang}[${text}](${REPO}/${bang ? "raw" : "blob"}/main/${path.replace(/^\.\//, "")})`,
);
writeFileSync(join(out, "README.md"), readme);
copyFileSync(join(root, "LICENSE"), join(out, "LICENSE"));

console.log(`staged ${pkg.version} in ${out}`);
