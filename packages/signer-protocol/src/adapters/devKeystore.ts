// SPDX-License-Identifier: MIT
// ================================================================================================
// TEST ONLY. TEST ONLY. This adapter holds a raw private key in the running process.
//
// It exists for one job: driving the launch flow end to end against a local anvil node or a fork,
// where the "key" is a throwaway account with no value on it and every transaction is thrown away
// with the node. Nothing about it is a smaller version of a production signer. Use
// `adapters/localSidecar.ts` for anything that touches a chain a human cares about.
//
// WHY IT REFUSES THE PRODUCTION CHAINS OUTRIGHT.
//
// The mistake this guard exists to prevent is not "someone deliberately signs mainnet with a dev
// key". It is the ordinary one: a fork harness is pointed at a real RPC, or an environment file is
// copied between machines, or `--chain-id` is left off an `anvil --fork-url` invocation — and anvil
// forking mainnet KEEPS CHAIN ID 1 unless it is told otherwise, so the harness that was "obviously
// local" produces transactions that are valid on Ethereum. A dev key that reaches a real chain is a
// key whose transactions are replayable by anyone who has ever read the anvil documentation, and a
// launch is irreversible: the ProjectRights NFT and the fee stream go where the calldata says.
//
// So the refusal is structural rather than advisory, and the refused set is DERIVED from
// `SUPPORTED_CHAIN_IDS` — the kit's one declaration of the chains the bundle format understands —
// rather than typed out here. A production chain added to that list tomorrow is refused by this
// adapter today, without anyone remembering that this file exists.
//
// PRACTICAL CONSEQUENCE, stated because it will otherwise be discovered as a bug: a fork harness
// must run its node with an explicit local chain id (`anvil --fork-url <rpc> --chain-id 31337`).
// A fork left on chain id 1 is refused here, correctly, and the fix is the flag — never an
// exception carved into this file.
// ================================================================================================
import { privateKeyToAccount } from "viem/accounts";
import { SUPPORTED_CHAIN_IDS } from "../../../project-schema/index.js";
import { SignerRefusedError, SignerTransportError, type SignerAdapter } from "../index.ts";
import type { Address, SignerResult, SigningRequest } from "../contracts.ts";

/**
 * The env var holding the throwaway key. Read at call time, never at import: a module that reads a
 * key when it is loaded puts one in memory in every process that merely imports this file.
 */
export const DEV_SIGNER_KEY_ENV = "RELICS_DEV_SIGNER_PRIVATE_KEY";

/**
 * Chains this adapter will never sign for. Ethereum (1), Base (8453), Robinhood Chain (4663) and
 * BNB Smart Chain (56) at the time of writing — but read from the declaration, not from that list.
 */
export const REFUSED_CHAIN_IDS: readonly number[] = Object.freeze([...(SUPPORTED_CHAIN_IDS as readonly number[])]);

export interface DevKeystoreOptions {
  readonly id?: string;
  /**
   * Overrides the environment. Present so a test can pass the well-known anvil account explicitly
   * instead of mutating the process environment; it is not a way to widen anything.
   */
  readonly privateKey?: string;
}

const KEY_SHAPE = /^0x[0-9a-fA-F]{64}$/;

function refusalFor(chainId: number): SignerRefusedError {
  return new SignerRefusedError({
    kind: "REFUSED",
    code: "SIGNER_DOES_NOT_SUPPORT_CHAIN",
    detail:
      `the development keystore signer refuses chain ${chainId}: it is a production chain and this signer holds a throwaway key in process. ` +
      `Run a local node with an explicit local chain id, or use the sidecar signer.`,
  });
}

/**
 * TEST ONLY — a signer backed by a key in this process.
 *
 * The key is never returned, never logged, and never placed in an error message: an error carrying
 * the value it was complaining about is how a key reaches a transcript.
 */
export function createDevKeystoreSigner(options: DevKeystoreOptions = {}): SignerAdapter {
  const id = options.id ?? "dev-keystore";

  function account() {
    const raw = options.privateKey ?? process.env[DEV_SIGNER_KEY_ENV];
    if (!raw) throw new SignerTransportError("DEV_SIGNER_KEY_NOT_CONFIGURED", `${DEV_SIGNER_KEY_ENV} is not set`);
    if (!KEY_SHAPE.test(raw)) throw new SignerTransportError("DEV_SIGNER_KEY_MALFORMED", `${DEV_SIGNER_KEY_ENV} is not a 0x-prefixed 32-byte hex value`);
    return privateKeyToAccount(raw as `0x${string}`);
  }

  return {
    id,

    async getAddress(): Promise<Address> {
      return account().address;
    },

    async supportsChain(chainId: number): Promise<boolean> {
      return !REFUSED_CHAIN_IDS.includes(chainId);
    },

    async sign(req: SigningRequest): Promise<SignerResult> {
      // THE CHAIN IS CHECKED BEFORE THE KEY IS READ. Two reasons, both load-bearing. A mainnet
      // request must be refused for being mainnet rather than for a missing key — otherwise setting
      // the key "fixes" it. And a production code path must never reach the branch that loads a
      // development key at all.
      if (REFUSED_CHAIN_IDS.includes(req.chainId)) throw refusalFor(req.chainId);

      // Not defaulted. A signer that invents a nonce signs a transaction nobody simulated, and a
      // signer that invents a fee signs one nobody priced.
      if (req.nonce === undefined) throw new SignerTransportError("INCOMPLETE_SIGNING_REQUEST", "the request carries no nonce; this signer has no client to read one from and will not invent one");
      if (req.maxFeePerGas === undefined || req.maxPriorityFeePerGas === undefined) {
        throw new SignerTransportError("INCOMPLETE_SIGNING_REQUEST", "the request carries no maxFeePerGas/maxPriorityFeePerGas; this signer has no client to price a transaction and will not invent a fee");
      }

      const signer = account();
      const rawTransaction = await signer.signTransaction({
        type: "eip1559",
        chainId: req.chainId,
        to: req.to,
        value: req.value,
        data: req.data,
        gas: req.estimatedGas,
        maxFeePerGas: req.maxFeePerGas,
        maxPriorityFeePerGas: req.maxPriorityFeePerGas,
        nonce: req.nonce,
      });
      // SIGNED, never BROADCAST. This adapter has no client and no RPC URL, so it cannot put a
      // transaction on a chain even if it were asked to — the caller decides where the bytes go.
      return { kind: "SIGNED", rawTransaction, signerAddress: signer.address };
    },
  };
}
