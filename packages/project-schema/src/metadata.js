// SPDX-License-Identifier: MIT
// `metadata/collection.json` — collection-level metadata. Shares the ERC-7572 field names the
// launchpad's contractURI payload uses, so an importer maps it straight across.
//
// Image fields point at bundle-relative paths under `assets/`, never at a URL. A bundle that
// referenced a remote image would make the importer fetch an attacker-chosen host at import time;
// the format simply has no field that can hold one.

import { LIMITS } from "./limits.js";
import { SYMBOL_RE } from "./manifest.js";
import { error, warn } from "./issues.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ASSET_RE = /^assets\/[A-Za-z0-9._-]+$/;
const SOCIAL_KEYS = Object.freeze(["x", "telegram", "discord", "github", "farcaster"]);

/**
 * @param {any} document
 * @returns {import("./issues.js").Issue[]}
 */
export function validateCollectionMetadata(document) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  const at = "metadata/collection.json";

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return [error("METADATA_SHAPE", at, "collection metadata must be a JSON object")];
  }
  const allowed = ["version", "name", "symbol", "description", "image", "bannerImage", "featuredImage", "externalLink", "collaborators", "socials", "tokenNamePattern"];
  for (const key of Object.keys(document)) {
    if (!allowed.includes(key)) issues.push(error("METADATA_UNKNOWN_KEY", `${at}#${key}`, `unknown key "${key}" (allowed: ${allowed.join(", ")})`));
  }
  if (document.version !== 1) issues.push(error("METADATA_VERSION", `${at}#version`, "version must be 1"));

  str(issues, document.name, `${at}#name`, "METADATA_NAME", LIMITS.maxNameLength);
  str(issues, document.description, `${at}#description`, "METADATA_DESCRIPTION", LIMITS.maxDescriptionLength);
  if (typeof document.symbol !== "string" || !SYMBOL_RE.test(document.symbol)) {
    issues.push(error("METADATA_SYMBOL", `${at}#symbol`, `symbol must be 1-${LIMITS.maxSymbolLength} uppercase letters and digits`));
  }

  for (const key of ["image", "bannerImage", "featuredImage"]) {
    const value = document[key];
    if (value === undefined || value === "") {
      if (key === "image") issues.push(warn("METADATA_NO_IMAGE", `${at}#image`, "no collection image — marketplaces will show a blank tile until one is set"));
      continue;
    }
    if (typeof value !== "string" || !ASSET_RE.test(value)) {
      issues.push(
        error("METADATA_IMAGE_PATH", `${at}#${key}`, `${key} must be a bundle-relative path under assets/ (a URL is refused: the importer never fetches a host a bundle names)`),
      );
    }
  }

  if (document.externalLink !== undefined && document.externalLink !== "") {
    if (typeof document.externalLink !== "string" || document.externalLink.length > LIMITS.maxUrlLength || !/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s]*)?$/.test(document.externalLink)) {
      issues.push(error("METADATA_EXTERNAL_LINK", `${at}#externalLink`, "externalLink must be an https:// URL"));
    }
  }

  if (document.tokenNamePattern !== undefined) {
    if (typeof document.tokenNamePattern !== "string" || document.tokenNamePattern.length > LIMITS.maxNameLength || !document.tokenNamePattern.includes("{id}")) {
      issues.push(error("METADATA_TOKEN_NAME", `${at}#tokenNamePattern`, 'tokenNamePattern must be a short string containing "{id}"'));
    }
  }

  if (document.collaborators !== undefined) {
    if (!Array.isArray(document.collaborators)) {
      issues.push(error("METADATA_COLLABORATORS", `${at}#collaborators`, "collaborators must be an array"));
    } else {
      if (document.collaborators.length > LIMITS.maxMetaCollaborators) {
        issues.push(error("METADATA_COLLABORATORS", `${at}#collaborators`, `at most ${LIMITS.maxMetaCollaborators} attribution collaborators`));
      }
      document.collaborators.forEach((c, i) => {
        const where = `${at}#collaborators[${i}]`;
        if (!c || typeof c !== "object" || Array.isArray(c)) {
          issues.push(error("METADATA_COLLABORATOR", where, "each collaborator must be an object"));
          return;
        }
        for (const key of Object.keys(c)) {
          if (!["address", "role"].includes(key)) issues.push(error("METADATA_UNKNOWN_KEY", `${where}.${key}`, `unknown key "${key}" (allowed: address, role)`));
        }
        if (typeof c.address !== "string" || !ADDRESS_RE.test(c.address)) {
          issues.push(error("METADATA_COLLABORATOR", `${where}.address`, "collaborator address must be a 0x-prefixed 20-byte address"));
        }
        str(issues, c.role, `${where}.role`, "METADATA_COLLABORATOR_ROLE", 48);
      });
    }
  }

  if (document.socials !== undefined) {
    if (!document.socials || typeof document.socials !== "object" || Array.isArray(document.socials)) {
      issues.push(error("METADATA_SOCIALS", `${at}#socials`, "socials must be an object"));
    } else {
      for (const key of Object.keys(document.socials)) {
        if (!SOCIAL_KEYS.includes(key)) {
          issues.push(error("METADATA_UNKNOWN_KEY", `${at}#socials.${key}`, `unknown social "${key}" (allowed: ${SOCIAL_KEYS.join(", ")})`));
          continue;
        }
        const value = document.socials[key];
        if (typeof value !== "string" || value.length > LIMITS.maxUrlLength || !/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s]*)?$/.test(value)) {
          issues.push(error("METADATA_SOCIAL_URL", `${at}#socials.${key}`, `${key} must be a full https:// URL, never a bare handle`));
        }
      }
    }
  }

  return issues;
}

function str(issues, value, where, code, max) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    issues.push(error(code, where, `must be a string of 1-${max} characters`));
  }
}
