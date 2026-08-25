import { numberToHex, getAddress, keccak256, encodeAbiParameters, getCreate2Address, createPublicClient, http, defineChain } from "viem";
import { FACTORY_ABI, buildLaunchParams, AntiSnipeMode, ArtMode, StartingPreset, encodeLaunch, prepare } from "@relics/launch-sdk";
import { readFileSync } from "node:fs";
const RPC="http://127.0.0.1:8545";
const chain=defineChain({id:1,name:"fork",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[RPC]}}});
const pub=createPublicClient({chain,transport:http(RPC)});
const FACTORY="0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E";
const launcher="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const wiring=await pub.readContract({address:FACTORY,abi:FACTORY_ABI(),functionName:"wiring"});
const [h]=await pub.readContract({address:FACTORY,abi:FACTORY_ABI(),functionName:"hookInitCodeHashes"});
const ls=(l,s)=>keccak256(encodeAbiParameters([{type:"address"},{type:"bytes32"}],[l,s]));
let hookSalt;for(let i=0;i<2e6;i++){const s=numberToHex(i,{size:32});const a=getCreate2Address({from:wiring[7],salt:ls(FACTORY,ls(launcher,s)),bytecodeHash:h});if((BigInt(a)&0x3fffn)===0x14c0n){hookSalt=s;break;}}
const S=await import("@relics/project-schema");
const c=S.readContainer(new Uint8Array(readFileSync(process.argv[2])));
const m=JSON.parse(new TextDecoder().decode(c.byPath.get("relics.project.json")));
const input={name:m.project.name,symbol:m.project.symbol,totalSupplyWhole:BigInt(m.supply.totalSupplyWhole),artworkBackingUnits:BigInt(m.supply.artworkSupply),startingPreset:StartingPreset[m.market.startingPreset],creatorRecipient:getAddress(m.earnings.creatorRecipient),antiSnipeMode:AntiSnipeMode[m.market.antiSnipeMode],metadataUri:process.argv[3],art:{mode:ArtMode.SOLIDITY_SVG,artTemplateId:BigInt(m.artBinding.templateId),artConfig:`0x${m.artBinding.artConfig}`}};
const p=prepare(input,{tokenSalt:numberToHex(1,{size:32}),hookSalt},1,FACTORY);
console.log(encodeLaunch(p.params).data);
