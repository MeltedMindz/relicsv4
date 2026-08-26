// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ONE CROSSING POINT INTO @relics/signer-protocol.
//
// Every wallet and authorization command reaches the signer package through this file and no other.
// One crossing point means the CLI restates none of the signer's rules: there is no second
// keystore, no second grant format and no second idea of where ~/.relics lives. When the signer
// package moves, one import list moves with it.
//
// IT IS ALSO WHERE A RESOLUTION FAILURE BECOMES A SENTENCE. These modules are TypeScript sources
// executed directly by Node's type stripping, which resolves import specifiers LITERALLY — a `.js`
// specifier naming a `.ts` file is not rewritten. A creator who hits that gets
// `ERR_MODULE_NOT_FOUND` naming a file that does not exist, with no hint that the missing name is a
// typo one directory over. Translating it here costs nothing and saves the whole session.
// ================================================================================================

const SIGNER_PACKAGE = "@relics/signer-protocol";

function explain(err, what) {
  const message = err instanceof Error ? err.message : String(err);
  const missing = /Cannot find module '([^']+)'/.exec(message);
  if (missing) {
    return new Error(
      `${what} could not be loaded from ${SIGNER_PACKAGE}: it imports ${missing[1]}, which does not exist.\n` +
        "  Node executes this package's TypeScript sources directly and resolves import specifiers literally,\n" +
        "  so a specifier ending in .js must name a real .js file. The signer package's own convention is a\n" +
        "  .ts specifier (see its tsconfig comment). This is a defect in the signer package, not in your setup.\n" +
        "  Nothing has been written and no key has been touched.",
    );
  }
  return new Error(`${what} could not be loaded from ${SIGNER_PACKAGE}: ${message}`);
}

/**
 * The grant: read/write/check/revoke, plus where ~/.relics is. Never re-implemented here.
 *
 * Imported from the PACKAGE ROOT, because the signer re-exports these deliberately: a grant is not
 * a secret, it is the record of what a human agreed to, and every surface that refuses a launch
 * needs to be able to say why.
 */
export async function loadAuthorization() {
  try {
    return await import("@relics/signer-protocol");
  } catch (err) {
    throw explain(err, "The authorization module");
  }
}

/**
 * The encrypted keystore.
 *
 * A DEEP PATH, AND THAT IS THE SIGNER'S CHOICE RATHER THAN AN OVERSIGHT. Its own header says the
 * module is not re-exported from the package index so that nothing reaches it by autocomplete —
 * a caller has to name the file. This function is the one place in the CLI that does, which is why
 * "where does the kit touch key material" has a one-line answer.
 *
 * NOTE WHAT IS NOT HERE: there is no export-key helper, no "just show me the key" path and no
 * decrypt wrapper. `unlockPrivateKey` is re-exported because a passphrase has to be PROVEN to open
 * the file before we tell a creator their wallet is ready — but every caller in this CLI discards
 * what it returns without printing, storing or passing it on.
 */
export async function loadKeystore() {
  try {
    return await import("@relics/signer-protocol/src/wallet/keystore.ts");
  } catch (err) {
    throw explain(err, "The wallet keystore module");
  }
}

/** viem's address helpers, used for checksumming only. Reached through the signer package's dep. */
export async function loadAddressTools() {
  const { getAddress, isAddress } = await import("viem");
  return { getAddress, isAddress };
}
