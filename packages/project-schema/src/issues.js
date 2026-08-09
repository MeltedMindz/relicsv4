// SPDX-License-Identifier: MIT
// One issue shape for every check in the package, so the CLI, a server route and a worker can all
// render the same result without translating between formats.

/**
 * @typedef {"error" | "warning"} Severity
 * @typedef {{ severity: Severity, code: string, where: string, message: string }} Issue
 */

/** @returns {Issue} */
export function error(code, where, message) {
  return { severity: "error", code, where, message };
}

/** @returns {Issue} */
export function warn(code, where, message) {
  return { severity: "warning", code, where, message };
}

/** @param {Issue[]} issues */
export function hasErrors(issues) {
  return issues.some((i) => i.severity === "error");
}

/** @param {Issue[]} issues */
export function summarize(issues) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { ok: errors.length === 0, errorCount: errors.length, warningCount: warnings.length, errors, warnings };
}

/** Stable ordering for reporting: errors first, then by code, then by location. */
export function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.where < b.where ? -1 : a.where > b.where ? 1 : 0;
  });
}
