// Cloudflare Pages build: copy only the public site into dist/ (Pages build command: `node build.mjs`).
// Without it, Pages would serve every repo file: notes (*.md), api/ and functions/ source, tools, configs.
// Vercel kept these out (.vercelignore + api/ = functions, not files). Usage: node build.mjs [outDir]
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = resolve(process.argv[2] || join(root, "dist"));

// Never public. Paths are repo-relative with "/" separators; checks are case-insensitive.
const SKIP_DIRS = new Set(["api", "functions", "tools", "dist", "node_modules", "_old"]);   // top level only
const SKIP_FILES = new Set(["wrangler.toml", "vercel.json", "build.mjs", "package.json", "package-lock.json",
  "desk-593457/index.html"]);   // old dashboard: Vercel redirected its URL to /os, so it was never served
const SKIP_EXT = /\.(md|py|bat|cmd|ps1|cjs|mjs|toml|log|bak)$/i;
const SKIP_NAME = /^(desktop\.ini|thumbs\.db|folder\.ico)$/i;

function skip(rel, isDir) {
  const parts = rel.split("/"), low = rel.toLowerCase();
  if (parts.some((p) => p.startsWith("."))) return true;                 // .git, .gitignore, .vercelignore, .wrangler, .vercel
  if (parts.length === 1 && isDir && SKIP_DIRS.has(low)) return true;
  if (isDir) return false;
  return SKIP_FILES.has(low) || SKIP_EXT.test(rel) || SKIP_NAME.test(parts[parts.length - 1]);
}

const up = relative(out, resolve(root));   // "" = same folder; no ".." = the repo sits inside outDir
if (!up || !up.startsWith("..")) throw new Error("outDir must not be the repo or contain it: " + out);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let files = 0;
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name), rel = relative(root, abs).split(sep).join("/");
    if (abs === out || skip(rel, e.isDirectory())) continue;
    if (e.isDirectory()) walk(abs);
    else if (e.isFile()) { cpSync(abs, join(out, rel), { recursive: true }); files++; }
  }
})(root);

// Functions run only on these paths; every static file stays a free static request.
writeFileSync(join(out, "_routes.json"), JSON.stringify({ version: 1, include: ["/api/*", "/os", "/os/"], exclude: [] }, null, 2) + "\n");
console.log(`build: ${files} files -> ${out}`);
if (!statSync(join(out, "index.html")).isFile()) throw new Error("index.html missing");
