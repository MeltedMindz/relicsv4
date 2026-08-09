#!/usr/bin/env node
// Offline internal link checker: verifies that every relative Markdown link in README.md,
// CONTRIBUTING.md, and docs/*.md points at a file that exists. No network access, no secrets.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const roots = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "AGENTS.md", "CLAUDE.md"];

// Walk docs/ recursively so nested guides (docs/launchpad/**) are checked too.
function collectMarkdown(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectMarkdown(full);
    else if (entry.endsWith(".md")) roots.push(full);
  }
}
collectMarkdown("docs");

const linkRe = /\]\(([^)]+)\)/g;
let broken = 0;
let checked = 0;

for (const file of roots) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    let target = m[1].trim();
    if (!target) continue;
    // Skip external, anchors, mailto, and inline images by scheme.
    if (/^(https?:|mailto:|#|data:)/.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target) continue;
    checked++;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      console.error(`BROKEN: ${file} -> ${m[1]}`);
      broken++;
    }
  }
}

console.log(`Checked ${checked} internal links across ${roots.length} files.`);
if (broken > 0) {
  console.error(`${broken} broken internal link(s).`);
  process.exit(1);
}
console.log("All internal links resolve.");
