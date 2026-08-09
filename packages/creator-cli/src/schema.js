// SPDX-License-Identifier: MIT
// The single import site for the shared schema package.
//
// Inside this repository the CLI and `@relics/project-schema` live side by side under packages/,
// so the import is a path. When the schema package is published or vendored elsewhere, this one
// line becomes `export * from "@relics/project-schema";` and nothing else in the CLI changes.
// Keeping the indirection in one file is what stops a second, drifting copy of the schema from
// appearing in the CLI.
export * from "../../project-schema/index.js";

export const SCHEMA_PACKAGE_DIR = new URL("../../project-schema/", import.meta.url);
