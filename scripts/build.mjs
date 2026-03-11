import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const targets = {
  chrome: {
    manifest: "manifest.chrome.json",
    outdir: "dist/chrome"
  },
  firefox: {
    manifest: "manifest.firefox.json",
    outdir: "dist/firefox"
  }
};

const only = process.argv[2];
const selected = only ? { [only]: targets[only] } : targets;

for (const [name, cfg] of Object.entries(selected)) {
  if (!cfg) {
    console.error(`Unknown build target: ${name}`);
    process.exit(1);
  }

  await mkdir(cfg.outdir, { recursive: true });

  const common = {
    bundle: true,
    format: "iife",
    target: "chrome114",
    sourcemap: false
  };

  await build({
    ...common,
    entryPoints: ["src/content-script.ts"],
    outfile: path.join(cfg.outdir, "content-script.js")
  });

  await build({
    ...common,
    entryPoints: ["src/background.ts"],
    outfile: path.join(cfg.outdir, "background.js")
  });

  const manifestSrc = await readFile(cfg.manifest, "utf8");
  await writeFile(path.join(cfg.outdir, "manifest.json"), manifestSrc);

  if (existsSync("assets")) {
    await cp("assets", path.join(cfg.outdir, "assets"), { recursive: true });
  }

  console.log(`Built ${name} -> ${cfg.outdir}`);
}