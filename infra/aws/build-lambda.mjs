import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "infra/aws/dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  entryPoints: [resolve(root, "services/api/src/lambda.ts")],
  outfile: resolve(output, "index.mjs"),
  bundle: true,
  external: ["pg-native"],
  format: "esm",
  minify: true,
  platform: "node",
  target: "node22",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});

await cp(resolve(root, "apps/console/dist"), resolve(output, "public"), { recursive: true });
await cp(resolve(root, "eval/reports"), resolve(output, "eval/reports"), { recursive: true });
await cp(resolve(root, "fixtures"), resolve(output, "fixtures"), { recursive: true });
await cp(resolve(root, "packages/db/migrations"), resolve(output, "migrations"), { recursive: true });
