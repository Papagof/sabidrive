// Assembles a fully self-contained, upload-ready folder from a Next.js
// `output: "standalone"` build, for hosts (like Hostinger's Node.js App
// feature) that can't run a pnpm-workspace install themselves.
//
// Usage: node scripts/package-standalone.mjs <family|admin>
//
// Run the app's build first (`pnpm --filter <app> build`). This script then
// copies `apps/<app>/.next/standalone` into `dist-hostinger/<app>/`,
// *dereferencing* every symlink into a real file copy — Next's standalone
// tracing on a pnpm-workspace project leaves symlinks pointing at the local
// pnpm store *outside* the standalone folder (e.g.
// `apps/<app>/node_modules/next` -> `<repo>/node_modules/.pnpm/next@.../...`),
// which only resolves on this machine. A raw zip of `.next/standalone` would
// silently break on any other machine; copying with `dereference: true`
// bakes in real file content so the result is portable.
//
// It also copies `apps/<app>/public` and `apps/<app>/.next/static` into
// their expected locations inside the standalone tree — Next's standalone
// output does not include these itself (Vercel's platform normally adds
// them; a manual deploy must).
//
// One more pnpm-specific wrinkle, found by actually booting the packaged
// server: pnpm keeps each dependency's *own* runtime dependencies as sibling
// symlinks inside a private folder in its virtual store (e.g. `next`'s own
// `styled-jsx` dependency lives at
// `node_modules/.pnpm/next@.../node_modules/styled-jsx`, a *sibling* of the
// real `next` folder in that same isolated directory — not nested inside
// `next/` itself). Node's module resolution only finds that sibling because,
// pre-packaging, `apps/<app>/node_modules/next` is a *symlink*, so Node
// resolves requires from `next`'s real (symlink-resolved) location and its
// real siblings are on the ancestor-directory search path. Flattening that
// symlink into a plain copy — necessary for portability — throws away those
// siblings, breaking `next`'s own ability to find dependencies like
// `styled-jsx` it requires dynamically (they're never statically imported,
// so Next's build-time file tracing doesn't catch them either). The fix:
// whenever dereferencing a symlink that points into a pnpm virtual-store
// package folder, also copy every sibling from that same folder alongside it.

import {
  existsSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  lstatSync,
  realpathSync,
  copyFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isPnpmVirtualStorePackageDir(dir) {
  const parts = dir.split(path.sep);
  const pnpmIdx = parts.lastIndexOf(".pnpm");
  return pnpmIdx !== -1 && parts[pnpmIdx - 1] === "node_modules" && parts.at(-1) === "node_modules";
}

function copyDereferenced(src, dest) {
  const stat = statSync(src);
  if (!stat.isDirectory()) {
    copyFileSync(src, dest);
    return;
  }

  mkdirSync(dest, { recursive: true });
  const isNodeModulesDir = path.basename(src) === "node_modules";

  for (const entry of readdirSync(src)) {
    const entrySrc = path.join(src, entry);
    const entryDest = path.join(dest, entry);
    if (existsSync(entryDest)) continue; // already brought in as a promoted sibling

    copyDereferenced(entrySrc, entryDest);

    if (isNodeModulesDir) {
      const entryLstat = lstatSync(entrySrc);
      if (!entryLstat.isSymbolicLink()) continue;
      const realParent = path.dirname(realpathSync(entrySrc));
      if (!isPnpmVirtualStorePackageDir(realParent)) continue;
      for (const sibling of readdirSync(realParent)) {
        const siblingDest = path.join(dest, sibling);
        if (existsSync(siblingDest)) continue;
        copyDereferenced(path.join(realParent, sibling), siblingDest);
      }
    }
  }
}

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = process.argv[2];

if (app !== "family" && app !== "admin") {
  console.error("Usage: node scripts/package-standalone.mjs <family|admin>");
  process.exit(1);
}

const appDir = path.join(repoRoot, "apps", app);
const standaloneDir = path.join(appDir, ".next", "standalone");
const outDir = path.join(repoRoot, "dist-hostinger", app);

if (!existsSync(standaloneDir)) {
  console.error(
    `No standalone build found at ${standaloneDir}\nRun "pnpm --filter ${app} build" first.`
  );
  process.exit(1);
}

console.log(`Packaging ${app}...`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Bakes symlink targets into real files, so the folder is portable off this
// machine.
copyDereferenced(standaloneDir, outDir);

const nestedAppDir = path.join(outDir, "apps", app);
const publicDir = path.join(appDir, "public");
if (existsSync(publicDir)) {
  copyDereferenced(publicDir, path.join(nestedAppDir, "public"));
}
copyDereferenced(path.join(appDir, ".next", "static"), path.join(nestedAppDir, ".next", "static"));

const startupFile = path.join("apps", app, "server.js");
console.log(`Done: ${outDir}`);
console.log(`\nUpload this whole folder to Hostinger, then in hPanel's Node.js App config set:`);
console.log(`  Application root      -> the uploaded folder (this one)`);
console.log(`  Application startup file -> ${startupFile}`);
console.log(`  Node.js version        -> 22.x`);
