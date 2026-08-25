// Spike: drive an RC6 launch against a local anvil fork. Throwaway.
import { createPublicClient, createWalletClient, http, defineChain, getCreate2Address, keccak256, encodeAbiParameters, numberToHex, getAddress, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FACTORY_ABI, METADATA_RESOLVER_ABI, buildLaunchParams, AntiSnipeMode, ArtMode, StartingPreset, launchParamsAsTuple, prepare, predict, encodeLaunch, simulate } from "@relics/launch-sdk";
import { readFileSync } from "node:fs";

const RPC = "http://127.0.0.1:8545";
const chain = defineChain({ id: 1, name: "fork", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
// TEST ONLY — anvil default account #0, public knowledge, never fund.
const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });

const FACTORY = "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E";
const RESOLVER = "0x112D480aeD3f6F6761E8136F4372AEbd48455e1b";

const wiring = await pub.readContract({ address: FACTORY, abi: FACTORY_ABI(), functionName: "wiring" });
const hookDeployer = wiring[7];
const [singleQuoteHash] = await pub.readContract({ address: FACTORY, abi: FACTORY_ABI(), functionName: "hookInitCodeHashes" });
console.log("hookDeployer", hookDeployer, "initCodeHash", singleQuoteHash);

const launcherSalt = (l, s) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [l, s]));
const nsSalt = (c, s) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [c, s]));

const MASK = 0x3fffn, FLAGS = 0x14c0n;
let hookSalt = null, hookAddr = null;
for (let i = 0; i < 2_000_000; i++) {
  const s = numberToHex(i, { size: 32 });
  const eff = nsSalt(FACTORY, launcherSalt(acct.address, s));
  const a = getCreate2Address({ from: hookDeployer, salt: eff, bytecodeHash: singleQuoteHash });
  if ((BigInt(a) & MASK) === FLAGS) { hookSalt = s; hookAddr = a; console.log("mined hook", a, "at i", i); break; }
}
if (!hookSalt) throw new Error("no hook salt");

// bundle
const bundlePath = process.argv[2];
const S = await import("@relics/project-schema");
const c = S.readContainer(new Uint8Array(readFileSync(bundlePath)));
const manifest = JSON.parse(new TextDecoder().decode(c.byPath.get("relics.project.json")));
const artConfig = `0x${manifest.artBinding.artConfig}`;

// metadata: assemble + pin in memory + publish to resolver
const { createMemoryProvider, pinAndVerifyMetadataDocument } = await import("./packages/launch-sdk/dist/metadata/index.js");
const provider = createMemoryProvider();
const doc = {
  name: manifest.project.name, symbol: manifest.project.symbol,
  description: manifest.project.description ?? "", image: "ipfs://bafkreiabcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrst",
  banner_image: "", featured_image: "", external_link: "", collaborators: [],
};
const pinned = await pinAndVerifyMetadataDocument({ provider, document: doc });
if (pinned.kind !== "VERIFIED") { console.error("pin refused", pinned); process.exit(1); }
console.log("uri", pinned.uri, "digest", pinned.resolverDigest);

const already = await pub.readContract({ address: RESOLVER, abi: METADATA_RESOLVER_ABI(), functionName: "isPublished", args: [pinned.resolverDigest] });
if (!already) {
  const pubHash = await wallet.writeContract({ address: RESOLVER, abi: METADATA_RESOLVER_ABI(), functionName: "publish", args: [pinned.uri] });
  const pubRcpt = await pub.waitForTransactionReceipt({ hash: pubHash });
  console.log("publish status", pubRcpt.status);
} else console.log("already published");
console.log("isPublished", await pub.readContract({ address: RESOLVER, abi: METADATA_RESOLVER_ABI(), functionName: "isPublished", args: [pinned.resolverDigest] }));

const input = {
  name: manifest.project.name, symbol: manifest.project.symbol,
  totalSupplyWhole: BigInt(manifest.supply.totalSupplyWhole),
  artworkBackingUnits: BigInt(manifest.supply.artworkSupply),
  startingPreset: StartingPreset[manifest.market.startingPreset],
  creatorRecipient: getAddress(manifest.earnings.creatorRecipient),
  antiSnipeMode: AntiSnipeMode[manifest.market.antiSnipeMode],
  metadataUri: pinned.uri,
  art: { mode: ArtMode.SOLIDITY_SVG, artTemplateId: BigInt(manifest.artBinding.templateId), artConfig },
};

for (let t = 1; t < 40; t++) {
  const tokenSalt = numberToHex(t, { size: 32 });
  const p = prepare(input, { tokenSalt, hookSalt }, 1, FACTORY);
  let pr;
  try { pr = await predict(pub, FACTORY, p.params, acct.address); }
  catch (e) { console.log("predict failed at t", t, String(e).slice(0, 300)); break; }
  console.log("t", t, "token", pr.projectToken, "hook", pr.artHook, "coll", pr.projectCollection);
  if ((BigInt(pr.artHook) & MASK) !== FLAGS) { console.log("  hook mask wrong!"); }
  const { data } = encodeLaunch(p.params);
  const sim = await simulate(pub, { from: acct.address, to: FACTORY, value: 0n, data, params: p.params });
  console.log("  sim ok?", sim.ok, sim.revert ?? "", "gas", sim.gasEstimate);
  if (sim.ok) {
    const h = await wallet.sendTransaction({ to: FACTORY, data, value: 0n, gas: (sim.gasEstimate * 12n) / 10n });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    console.log("  LAUNCH tx", h, "status", r.status, "gasUsed", r.gasUsed);
    const evs = parseEventLogs({ abi: FACTORY_ABI(), logs: r.logs });
    for (const e of evs) console.log("  event", e.eventName, JSON.stringify(e.args, (k, v) => typeof v === "bigint" ? String(v) : v));
    break;
  }
  break;
}

// raw revert probe
{
  const tokenSalt = numberToHex(1, { size: 32 });
  const p = prepare(input, { tokenSalt, hookSalt }, 1, FACTORY);
  const { data } = encodeLaunch(p.params);
  try {
    await pub.request({ method: "eth_call", params: [{ from: acct.address, to: FACTORY, data }, "latest"] });
  } catch (e) {
    console.log("RAW ERR:", JSON.stringify(e.details ?? e.shortMessage ?? e.message));
    console.log("cause:", JSON.stringify(e.cause?.data ?? e.data ?? null));
    console.log(String(e).slice(0,1500));
  }
}
