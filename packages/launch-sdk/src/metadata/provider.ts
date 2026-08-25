// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PINNING BOUNDARY — one interface, no company's secret format anywhere behind it.
//
// WHY AN INTERFACE AND NOT A PINATA CLIENT. Two reasons, and the second is the load-bearing one.
//
//   1. A creator should be able to bring their own pinning service, or none at all (the memory
//      adapter is a complete, honest implementation for a local or fork run).
//   2. THE VERIFICATION MUST BE ABLE TO USE A DIFFERENT PROVIDER THAN THE PIN DID. `pinAndVerify`
//      takes an optional second provider for the read-back precisely so the write path and the read
//      path can be different parties. A provider that both accepts bytes and reports them
//      retrievable is grading its own homework; a public gateway that has never heard of us saying
//      the same thing is evidence.
//
// CREDENTIALS COME FROM THE ENVIRONMENT AND STOP AT THE ADAPTER. Nothing in this interface accepts,
// returns or carries one. An adapter holds its token in a closure or a private field, sends it in
// exactly one header, and never writes it into a project file, a `.relics` bundle, a receipt, an
// error message or a log line. `pin` and `fetchByCid` deal in bytes and a CID — there is no field
// a credential could ride in even by accident, which is the point of shaping it this way.
// ================================================================================================

import { MetadataRefusal } from "./errors.js";

/** What a pin returns. Deliberately minimal: an address, and nothing that could carry a secret. */
export interface PinReceipt {
  /** The content address the PROVIDER chose. Read the document back by THIS, never by our own. */
  readonly cid: string;
}

/**
 * A pinning backend.
 *
 * `id` names the implementation for a receipt (`"pinata"`, `"http-gateway"`, `"memory"`), and is a
 * label rather than an authority claim — `available` is the honest one.
 *
 * `available` exists so an adapter with no credential can be CONSTRUCTED and can SAY SO, rather
 * than throwing at import time. A module that throws on import takes the whole CLI down when a
 * creator is only trying to validate a bundle offline, which turns a missing optional token into a
 * broken tool.
 */
export interface MetadataProvider {
  readonly id: string;
  /** False when this adapter has no credential, no transport, or is read-only for writes. */
  readonly available: boolean;
  /** Publish `bytes`. Throws {@link MetadataRefusal} on failure; never returns a partial success. */
  pin(bytes: Uint8Array, filename: string): Promise<PinReceipt>;
  /** Retrieve by CID over the READ path. Throws {@link MetadataRefusal} when it cannot serve it. */
  fetchByCid(cid: string): Promise<Uint8Array>;
  /**
   * A human-facing gateway URL. OPTIONAL, and never canonical: it names a host, and a host is not
   * content. Nothing derived from this value may reach a chain.
   */
  gatewayUrl?(cid: string): string;
}

/**
 * True when this provider can actually publish. A read-only gateway adapter answers `false` for
 * `available` and this is the predicate that keeps the distinction legible at a call site.
 */
export function canPin(provider: MetadataProvider): boolean {
  return provider.available === true;
}

/** Refuse early, with the provider's own id, rather than discovering it inside a pin attempt. */
export function assertCanPin(provider: MetadataProvider): void {
  if (!canPin(provider)) {
    throw new MetadataRefusal(
      "PROVIDER_UNAVAILABLE",
      "PROVIDER",
      `pin provider "${provider.id}" is not available (no credential configured, or it is read-only). ` +
        `Configure it out of band — never by writing a token into the project.`,
    );
  }
}
