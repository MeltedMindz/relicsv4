// SPDX-License-Identifier: MIT
// Terminal reporting. Colour is opt-in: it is used only when stdout is a TTY and NO_COLOR is
// unset, so piping a run into a file or a CI log gives plain text.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const ESC = String.fromCharCode(27);
const paint = (code, text) => (useColor ? ESC + "[" + code + "m" + text + ESC + "[0m" : text);
export const bold = (t) => paint("1", t);
export const dim = (t) => paint("2", t);
export const red = (t) => paint("31", t);
export const green = (t) => paint("32", t);
export const yellow = (t) => paint("33", t);
export const cyan = (t) => paint("36", t);

const STATUS = {
  pass: () => green("PASS"),
  warn: () => yellow("WARN"),
  fail: () => red("FAIL"),
  skipped: () => dim("SKIP"),
};

/** @param {import("./schema.js").ValidationResult} result */
export function printChecks(result) {
  for (const check of result.checks) {
    const status = (STATUS[check.status] ?? STATUS.skipped)();
    const detail = check.detail ? dim(` — ${truncate(check.detail, 96)}`) : "";
    console.log(`  ${status}  ${check.title}${detail}`);
  }
}

/** @param {import("./schema.js").ValidationResult} result */
export function printIssues(result) {
  if (result.issues.length === 0) return;
  console.log("");
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? red("error") : yellow("warn ");
    console.log(`  ${tag} ${bold(issue.code)} ${dim(issue.where)}`);
    console.log(`        ${issue.message}`);
  }
}

export function printHashes(result) {
  if (!result.hashes || !result.manifest) return;
  const m = result.manifest;
  console.log("");
  console.log(bold("  hashes"));
  const rows = [
    ["bundle", result.hashes.bundleHash],
    ["project config", result.hashes.projectConfigHash],
    ["content", result.hashes.contentHash],
    ["generator", m.hashes.generator],
    ["script", m.hashes.script],
    ["trait schema", m.hashes.traitSchema],
    ["market mapping", m.hashes.marketMapping],
    ["metadata", m.hashes.metadata],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) console.log(`    ${label.padEnd(width)}  ${cyan(value)}`);
}

export function heading(text) {
  console.log("");
  console.log(bold(text));
}

export function truncate(text, max) {
  const flat = String(text).replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
