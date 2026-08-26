// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ERC-20 TOKEN'S OWN METADATA — the half a launch does not write.
//
// A launch that succeeds on chain can still look broken everywhere a buyer looks: an unnamed
// address with a grey circle on the DEX, no symbol in the wallet, a supply figure nobody
// recognises. Nothing failed; the token's metadata was never published. Measured on the one real
// RC6 permissionless launch: `contractURI()` returns empty, `metadataRegistry` is the zero address
// and `metadataProjectId` is 0.
//
// THE COLLECTION AND THE TOKEN ARE DIFFERENT SURFACES AND ONLY ONE IS BIRTH DATA. The collection's
// `contractURI` rides inside the launch transaction and is complete on receipt. The token's does
// not: `ProjectTokenV1.initialize` takes no URI, and `contractURI()` resolves through a registry
// the token must be BOUND to afterwards.
//
// AND THE AGENT CANNOT DO THE BINDING, BY DESIGN. Both `ProjectMetadataRegistry.registerProject`
// and `ProjectTokenV1.bindMetadataRegistry` require `msg.sender == ProjectRights.ownerOf(projectId)`
// — and the rights NFT goes to `creatorRecipient`, which the whole wallet model says is a COLD
// wallet, not the launch key. That is a property worth keeping: the thing that can change a token's
// public identity forever is held by the creator, not by a hot key an agent drives.
//
// So this module does everything up to that line — assembles, pins, fetches back, verifies, and
// emits the two transactions ready to sign — and refuses to pretend the last step happened.
// ================================================================================================
import { encodeFunctionData, getAddress, type Abi, type Address, type Hex } from "viem";
import { canonicalMetadataJson } from "./canonicalDocument.js";
import { MetadataRefusal } from "./errors.js";
import type { MetadataProvider } from "./provider.js";
import { pinAndVerifyMetadataDocument } from "./pinAndVerify.js";

/** The ERC-1046 document an ERC-20's `tokenURI()` should point at. */
export interface TokenMetadataDocument {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly description: string;
  readonly image: string;
  readonly external_url?: string;
  readonly properties: {
    readonly chainId: number;
    readonly totalSupply: string;
    readonly burnable: boolean;
    readonly socials?: Readonly<Record<string, string>>;
  };
}

/** One Uniswap token-list entry. ADDRESS-BOUND, so it may only be built after deployment. */
export interface TokenListEntry {
  readonly chainId: number;
  readonly address: Address;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly logoURI: string;
}

export interface TokenMetadataInput {
  readonly name: string;
  readonly symbol: string;
  readonly decimals?: number;
  readonly description: string;
  /** An `ipfs://` logo URI. An HTTPS URL you control is a URL you can break; a CID is not. */
  readonly image: string;
  readonly externalUrl?: string;
  readonly chainId: number;
  readonly totalSupplyWei: bigint;
  readonly burnable: boolean;
  readonly socials?: Readonly<Record<string, string>>;
}

/**
 * Assemble the ERC-1046 document.
 *
 * NO ADDRESS FIELD, DELIBERATELY. The document describes the token; the ADDRESS-bound artifacts
 * (the token-list entry) are built separately and only from a real deployment record — a
 * placeholder address in a token list is worse than an absent one, because it is copyable, it looks
 * correct, and lists get mirrored and cached faster than they get corrected.
 */
export function buildTokenMetadataDocument(input: TokenMetadataInput): TokenMetadataDocument {
  if (!input.image.startsWith("ipfs://")) {
    throw new MetadataRefusal("URI_NOT_CANONICAL", "URI", `the token logo must be an ipfs:// URI so it cannot rot; got ${JSON.stringify(input.image.slice(0, 60))}`);
  }
  const decimals = input.decimals ?? 18;
  const doc: TokenMetadataDocument = {
    name: input.name,
    symbol: input.symbol,
    decimals,
    description: input.description,
    image: input.image,
    ...(input.externalUrl ? { external_url: input.externalUrl } : {}),
    properties: {
      chainId: input.chainId,
      // A DECIMAL STRING. A JSON number cannot hold 1e24 exactly, and a supply figure that silently
      // rounded is the kind of wrong number an aggregator will show confidently forever.
      totalSupply: input.totalSupplyWei.toString(),
      burnable: input.burnable,
      ...(input.socials ? { socials: input.socials } : {}),
    },
  };
  // Prove it canonicalises before anything tries to pin it.
  canonicalMetadataJson(doc);
  return doc;
}

/**
 * The address-bound token-list entry. REQUIRES the deployed address.
 *
 * Separated from the document for the reason the creator docs give: everything that is not the
 * address is written before deployment, and the address-bound artifacts are generated afterwards
 * from the real record, in one step.
 */
export function buildTokenListEntry(doc: TokenMetadataDocument, address: Address, chainId: number): TokenListEntry {
  const checksummed = getAddress(address);
  if (checksummed === "0x0000000000000000000000000000000000000000") {
    throw new MetadataRefusal("URI_NOT_CANONICAL", "URI", "refusing to build a token-list entry for the zero address");
  }
  return { chainId, address: checksummed, name: doc.name, symbol: doc.symbol, decimals: doc.decimals, logoURI: doc.image };
}

export interface VerifiedTokenMetadata {
  readonly uri: string;
  readonly cid: string;
  readonly contentSha256: string;
  readonly document: TokenMetadataDocument;
}

/** Pin the token document and read it back, through the same verified pipeline the collection uses. */
export async function pinTokenMetadata(document: TokenMetadataDocument, provider: MetadataProvider): Promise<VerifiedTokenMetadata> {
  const verified = await pinAndVerifyMetadataDocument({
    document,
    provider,
    filename: "token.json",
    // The ERC-1046 document is NOT an ERC-7572 contractURI and does not carry its key set. Passing
    // the collection's required keys here would refuse a perfectly good token document for lacking
    // `banner_image`, which no ERC-20 has.
    requiredKeys: ["name", "symbol", "decimals", "description", "image"],
  });
  // THE RESULT IS A UNION AND THE REFUSAL BRANCH IS NOT AN ERROR TO SWALLOW. `pinAndVerify` returns
  // either a verified document or a typed refusal; unwrapping without checking would turn "the
  // gateway served an HTML error page with a 200" into `undefined` fields flowing onward.
  // Discriminate on `kind`, not on the error class: `pinAndVerifyMetadataDocument` RETURNS a typed
  // refusal object rather than throwing one, and `isMetadataRefusal` tests for the thrown class.
  if (verified.kind === "REFUSED") {
    throw new MetadataRefusal(verified.code, verified.stage, `the token metadata could not be published and verified: ${verified.detail}`);
  }
  return { uri: verified.uri, cid: verified.cid, contentSha256: verified.contentSha256, document };
}

// ------------------------------------------------------------------------------------------------
// THE TWO TRANSACTIONS ONLY THE RIGHTS OWNER CAN SEND
// ------------------------------------------------------------------------------------------------

export interface RightsOwnerTransaction {
  readonly step: 1 | 2;
  readonly label: string;
  readonly to: Address;
  readonly data: Hex;
  readonly value: "0";
  readonly chainId: number;
  /** Who must send it. Always the ProjectRights owner — see the header. */
  readonly mustBeSentBy: Address;
  readonly why: string;
}

const REGISTRY_ABI = [
  { type: "function", name: "registerProject", stateMutability: "nonpayable", inputs: [{ name: "projectId", type: "uint256" }, { name: "website", type: "string" }, { name: "xLink", type: "string" }], outputs: [] },
] as const satisfies Abi;

const TOKEN_BIND_ABI = [
  { type: "function", name: "bindMetadataRegistry", stateMutability: "nonpayable", inputs: [{ name: "metadataRegistry_", type: "address" }], outputs: [] },
] as const satisfies Abi;

/**
 * The exact two transactions that make an ERC-20's `contractURI()` non-empty.
 *
 * RETURNED AS DATA, NOT SENT. The autonomous signer signs exactly one selector at exactly one
 * target — `launch()` at the canonical factory — and widening it to cover these would trade the
 * property that makes the whole wallet model defensible for a convenience. These go to the
 * creator's own wallet, which is where the rights NFT already is.
 */
export function buildRightsOwnerMetadataTransactions(args: {
  chainId: number;
  projectId: bigint;
  projectToken: Address;
  metadataRegistry: Address;
  rightsOwner: Address;
  website: string;
  xLink: string;
}): readonly RightsOwnerTransaction[] {
  return [
    {
      step: 1,
      label: "ProjectMetadataRegistry.registerProject",
      to: getAddress(args.metadataRegistry),
      data: encodeFunctionData({ abi: REGISTRY_ABI, functionName: "registerProject", args: [args.projectId, args.website, args.xLink] }),
      value: "0",
      chainId: args.chainId,
      mustBeSentBy: getAddress(args.rightsOwner),
      why: "Registers this project in the metadata registry. Reverts unless the project is already published AND the sender owns its ProjectRights NFT, so it can only run after the launch and only from the creator's wallet.",
    },
    {
      step: 2,
      label: "ProjectTokenV1.bindMetadataRegistry",
      to: getAddress(args.projectToken),
      data: encodeFunctionData({ abi: TOKEN_BIND_ABI, functionName: "bindMetadataRegistry", args: [getAddress(args.metadataRegistry)] }),
      value: "0",
      chainId: args.chainId,
      mustBeSentBy: getAddress(args.rightsOwner),
      why: "Points the ERC-20 at the registry so `contractURI()` resolves. ONE-SHOT and unrepeatable: the token refuses a second bind, so send it to the registry you intend to keep.",
    },
  ];
}

export type TokenMetadataState = "PUBLISHED" | "NOT_BOUND" | "UNKNOWN";

/**
 * Read the token's metadata state off the chain.
 *
 * `NOT_BOUND` is a REAL, PROVEN absence — the token said so. `UNKNOWN` is a failed read and must
 * never be rendered as absence: telling a creator their token has no metadata when the RPC simply
 * did not answer sends them to redo a one-shot binding they may already have done.
 */
export async function readTokenMetadataState(client: { readContract: (a: never) => Promise<unknown> }, token: Address, tokenAbi: Abi): Promise<{ state: TokenMetadataState; contractURI: string | null; registry: Address | null; detail: string }> {
  try {
    const uri = (await client.readContract({ address: token, abi: tokenAbi, functionName: "contractURI" } as never)) as string;
    const registry = (await client.readContract({ address: token, abi: tokenAbi, functionName: "metadataRegistry" } as never)) as Address;
    const bound = registry && getAddress(registry) !== "0x0000000000000000000000000000000000000000";
    if (uri && uri.length > 0) return { state: "PUBLISHED", contractURI: uri, registry: bound ? getAddress(registry) : null, detail: `contractURI() resolves to ${uri}` };
    return {
      state: "NOT_BOUND",
      contractURI: null,
      registry: bound ? getAddress(registry) : null,
      detail: bound
        ? "the token is bound to a registry but contractURI() is still empty; the project has not been registered in it"
        : "the token is not bound to a metadata registry, so contractURI() is empty. DEX front-ends, wallets and aggregators will show this token unnamed.",
    };
  } catch (err) {
    return { state: "UNKNOWN", contractURI: null, registry: null, detail: `the token's metadata state could not be read: ${err instanceof Error ? err.message : String(err)}. This is unread, NOT absent — do not re-run a one-shot binding on the strength of it.` };
  }
}
