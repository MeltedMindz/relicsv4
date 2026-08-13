// SPDX-License-Identifier: MIT
// Complete RC5 Robinhood stock/ETF token universe prepared for genesis quote admission.
// Generated from Robinhood's official asset source: https://api.robinhood.com/rhj/assets.
// The live QuoteAssetRegistry remains authoritative at import/launch time.

export const ROBINHOOD_STOCK_TOKENS_VERSION = "rc5-genesis-admission-2026-08-13"; // gitleaks:allow public registry version, not a credential
export const ROBINHOOD_STOCK_TOKENS_SOURCE = "https://api.robinhood.com/rhj/assets";
export const ROBINHOOD_STOCK_TOKENS_CHAIN_ID = 4663;

/** @typedef {{ symbol: string, name: string, address: `0x${string}`, decimals: number, isin: string | null }} RobinhoodStockToken */

/** @type {readonly RobinhoodStockToken[]} */
export const ROBINHOOD_STOCK_TOKENS = Object.freeze(
[
  {
    symbol: "AAOI",
    name: "Applied Optoelectronics - Robinhood Token",
    address: "0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E",
    decimals: 18,
    isin: "US03823U1025"
  },
  {
    symbol: "AAPL",
    name: "Apple - Robinhood Token",
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    decimals: 18,
    isin: "US0378331005"
  },
  {
    symbol: "ABCL",
    name: "Abcellera Biologics - Robinhood Token",
    address: "0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e",
    decimals: 18,
    isin: "CA00288U1066"
  },
  {
    symbol: "ADBE",
    name: "Adobe - Robinhood Token",
    address: "0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B",
    decimals: 18,
    isin: "US00724F1012"
  },
  {
    symbol: "AEHR",
    name: "Aehr - Robinhood Token",
    address: "0x5F604fBA1162193A4388A5DFa56F556f3E133cC2",
    decimals: 18,
    isin: "US00760J1088"
  },
  {
    symbol: "AEIS",
    name: "Advanced Energy - Robinhood Token",
    address: "0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612",
    decimals: 18,
    isin: "US0079731008"
  },
  {
    symbol: "ALAB",
    name: "Astera Labs, Inc. - Robinhood Token",
    address: "0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc",
    decimals: 18,
    isin: "US04626A1034"
  },
  {
    symbol: "AMAT",
    name: "Applied Materials - Robinhood Token",
    address: "0x36046893810a7E7fCE501229d57dc3FC8c8716d0",
    decimals: 18,
    isin: "US0382221051"
  },
  {
    symbol: "AMBA",
    name: "Ambarella - Robinhood Token",
    address: "0x99D9D8663545151603863C5AcbD6FC3218899009",
    decimals: 18,
    isin: "KYG037AX1015"
  },
  {
    symbol: "AMC",
    name: "AMC Entertainment - Robinhood Token",
    address: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B",
    decimals: 18,
    isin: "US00165C3025"
  },
  {
    symbol: "AMD",
    name: "AMD - Robinhood Token",
    address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC",
    decimals: 18,
    isin: "US0079031078"
  },
  {
    symbol: "AMKR",
    name: "Amkor Technology - Robinhood Token",
    address: "0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B",
    decimals: 18,
    isin: "US0316521006"
  },
  {
    symbol: "AMZN",
    name: "Amazon - Robinhood Token",
    address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    decimals: 18,
    isin: "US0231351067"
  },
  {
    symbol: "ANET",
    name: "Arista - Robinhood Token",
    address: "0x28bABD556b60E53663B8615036479a29c2CDd1Bf",
    decimals: 18,
    isin: "US0404132054"
  },
  {
    symbol: "APLD",
    name: "Applied Digital - Robinhood Token",
    address: "0xb8DBf92F9741c9ac1c32115E78581f23509916FD",
    decimals: 18,
    isin: "US0381692070"
  },
  {
    symbol: "APP",
    name: "AppLovin - Robinhood Token",
    address: "0xA249BAF1063Af884807C1E1400AEf7784836917E",
    decimals: 18,
    isin: "US03831W1080"
  },
  {
    symbol: "ASML",
    name: "ASML Holding NV - Robinhood Token",
    address: "0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA",
    decimals: 18,
    isin: "USN070592100"
  },
  {
    symbol: "ASTS",
    name: "AST SpaceMobile - Robinhood Token",
    address: "0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137",
    decimals: 18,
    isin: "US00217D1000"
  },
  {
    symbol: "AUR",
    name: "Aurora Innovation - Robinhood Token",
    address: "0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD",
    decimals: 18,
    isin: "US0517741072"
  },
  {
    symbol: "AVAV",
    name: "AeroVironment - Robinhood Token",
    address: "0xF6290b5e7C26502e2dA514C31509849718EA76A5",
    decimals: 18,
    isin: "US0080731088"
  },
  {
    symbol: "AVGO",
    name: "Broadcom - Robinhood Token",
    address: "0x156E175DD063a8cE274C50654eF40e0032b3fbcF",
    decimals: 18,
    isin: "US11135F1012"
  },
  {
    symbol: "AXON",
    name: "Axon - Robinhood Token",
    address: "0xC27dBD474aF5181c5A8777903690D8D262D12648",
    decimals: 18,
    isin: "US05464C1018"
  },
  {
    symbol: "AXTI",
    name: "AXT - Robinhood Token",
    address: "0x141eEa040c2250eEc0314e336975e81f85f6585e",
    decimals: 18,
    isin: "US00246W1036"
  },
  {
    symbol: "BA",
    name: "Boeing - Robinhood Token",
    address: "0x4D21483a44Bf67a86b77E3dA301411880797D452",
    decimals: 18,
    isin: "US0970231058"
  },
  {
    symbol: "BABA",
    name: "Alibaba - Robinhood Token",
    address: "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4",
    decimals: 18,
    isin: "US01609W1027"
  },
  {
    symbol: "BB",
    name: "Blackberry - Robinhood Token",
    address: "0x48E39E56aCdbA37b09020C0b734A613C9a2f100A",
    decimals: 18,
    isin: "CA09228F1036"
  },
  {
    symbol: "BE",
    name: "Bloom Energy - Robinhood Token",
    address: "0x822CC93fFD030293E9842c30BBD678F530701867",
    decimals: 18,
    isin: "US0937121079"
  },
  {
    symbol: "BND",
    name: "Vanguard Total Bond Market ETF - Robinhood Token",
    address: "0x2F62fC9fAbb470C690f141c28340eD832bB27020",
    decimals: 18,
    isin: "US9219378356"
  },
  {
    symbol: "BULL",
    name: "Webull - Robinhood Token",
    address: "0xceF9027c7d6985b85f0BA431125073529A947A68",
    decimals: 18,
    isin: "KYG9572D1034"
  },
  {
    symbol: "CBRS",
    name: "Cerebras Systems - Robinhood Token",
    address: "0x5c90450Bbb4273D7b2f17CF6917AEB237A569679",
    decimals: 18,
    isin: "US15675D1037"
  },
  {
    symbol: "CCL",
    name: "Carnival Corporation - Robinhood Token",
    address: "0x9651342CeA770aE9a2969Ba2A52611523146aef9",
    decimals: 18,
    isin: "BMG2004J1036"
  },
  {
    symbol: "CEG",
    name: "Constellation Energy - Robinhood Token",
    address: "0xaE517A2903E68bd929Dfd15be875F8369D53e94a",
    decimals: 18,
    isin: "US21037T1097"
  },
  {
    symbol: "CELH",
    name: "Celsius - Robinhood Token",
    address: "0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF",
    decimals: 18,
    isin: "US15118V2079"
  },
  {
    symbol: "CIEN",
    name: "Ciena - Robinhood Token",
    address: "0x44f6D488021f8233B9416294d1FE9b1fEe28382d",
    decimals: 18,
    isin: "US1717793095"
  },
  {
    symbol: "CLOV",
    name: "Clover Health Investments - Robinhood Token",
    address: "0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0",
    decimals: 18,
    isin: "US18914F1030"
  },
  {
    symbol: "CLS",
    name: "Celestica - Robinhood Token",
    address: "0xBf449977089c718C004a66C554B26B94ef3Ad4De",
    decimals: 18,
    isin: "CA15101Q2071"
  },
  {
    symbol: "CLSK",
    name: "CleanSpark - Robinhood Token",
    address: "0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3",
    decimals: 18,
    isin: "US18452B2097"
  },
  {
    symbol: "COHR",
    name: "Coherent - Robinhood Token",
    address: "0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894",
    decimals: 18,
    isin: "US19247G1076"
  },
  {
    symbol: "COIN",
    name: "Coinbase - Robinhood Token",
    address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b",
    decimals: 18,
    isin: "US19260Q1076"
  },
  {
    symbol: "COST",
    name: "Costco - Robinhood Token",
    address: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2",
    decimals: 18,
    isin: "US22160K1051"
  },
  {
    symbol: "CRCL",
    name: "Circle Internet Group - Robinhood Token",
    address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
    decimals: 18,
    isin: "US1725731079"
  },
  {
    symbol: "CRDO",
    name: "Credo Technology Group - Robinhood Token",
    address: "0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b",
    decimals: 18,
    isin: "KYG254571055"
  },
  {
    symbol: "CRM",
    name: "Salesforce - Robinhood Token",
    address: "0xd95B44124e475743a7589e68F3D74008A5536D44",
    decimals: 18,
    isin: "US79466L3024"
  },
  {
    symbol: "CRWD",
    name: "CrowdStrike Holdings - Robinhood Token",
    address: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931",
    decimals: 18,
    isin: "US22788C1053"
  },
  {
    symbol: "CRWV",
    name: "CoreWeave - Robinhood Token",
    address: "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3",
    decimals: 18,
    isin: "US21873S1087"
  },
  {
    symbol: "CSCO",
    name: "Cisco Systems - Robinhood Token",
    address: "0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA",
    decimals: 18,
    isin: "US17275R1023"
  },
  {
    symbol: "CTSH",
    name: "Cognizant - Robinhood Token",
    address: "0x63D5a3b6939a33f1e75d8Bcd85759858239600DB",
    decimals: 18,
    isin: "US1924461023"
  },
  {
    symbol: "CVNA",
    name: "Carvana - Robinhood Token",
    address: "0xa4f319104089FE321dc8093C6E707d4fE190A988",
    decimals: 18,
    isin: "US1468691027"
  },
  {
    symbol: "DDOG",
    name: "Datadog - Robinhood Token",
    address: "0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958",
    decimals: 18,
    isin: "US23804L1035"
  },
  {
    symbol: "DELL",
    name: "Dell - Robinhood Token",
    address: "0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd",
    decimals: 18,
    isin: "US24703L2025"
  },
  {
    symbol: "DJT",
    name: "Trump Media & Technology Group - Robinhood Token",
    address: "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516",
    decimals: 18,
    isin: "US25400Q1058"
  },
  {
    symbol: "DOCN",
    name: "DigitalOcean - Robinhood Token",
    address: "0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD",
    decimals: 18,
    isin: "US25402D1028"
  },
  {
    symbol: "ELF",
    name: "e.l.f. Beauty - Robinhood Token",
    address: "0x39EC44Bee4F6A116c6F9B8De566848a985C53C60",
    decimals: 18,
    isin: "US26856L1035"
  },
  {
    symbol: "EWT",
    name: "iShares MSCI Taiwan Capped ETF - Robinhood Token",
    address: "0x1c690498150252222C275A5CEd69d3A6b1f52D5E",
    decimals: 18,
    isin: "US46434G7723"
  },
  {
    symbol: "EWY",
    name: "iShares MSCI South Korea fund - Robinhood Token",
    address: "0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc",
    decimals: 18,
    isin: "US4642867729"
  },
  {
    symbol: "F",
    name: "Ford Motor - Robinhood Token",
    address: "0x25C288E6D899b9BC30160965aD9644c67e73bE0C",
    decimals: 18,
    isin: "US3453708600"
  },
  {
    symbol: "FICO",
    name: "Fair Isaac - Robinhood Token",
    address: "0xa48F22A46C0F1C46CA7D111CB6c137c271987180",
    decimals: 18,
    isin: "US3032501047"
  },
  {
    symbol: "FIG",
    name: "Figma - Robinhood Token",
    address: "0x41F4267525a8AFf329540eF24fD83d9044758B33",
    decimals: 18,
    isin: "US3168411052"
  },
  {
    symbol: "FISV",
    name: "Fiserv - Robinhood Token",
    address: "0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc",
    decimals: 18,
    isin: "US3377381088"
  },
  {
    symbol: "FIX",
    name: "Comfort Systems - Robinhood Token",
    address: "0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac",
    decimals: 18,
    isin: "US1999081045"
  },
  {
    symbol: "FLNC",
    name: "Fluence Energy - Robinhood Token",
    address: "0x282e87451E10fA6679BC7D76C69BE44cD3fC777C",
    decimals: 18,
    isin: "US34379V1035"
  },
  {
    symbol: "FLY",
    name: "Firefly Aerospace Inc. - Robinhood Token",
    address: "0x03BC731Ffb162cdd7B98D3C6542bFC291126075d",
    decimals: 18,
    isin: "US31816X1063"
  },
  {
    symbol: "FTNT",
    name: "Fortinet - Robinhood Token",
    address: "0x3FB8976980d486084b2eb4a404BD12e72823958f",
    decimals: 18,
    isin: "US34959E1091"
  },
  {
    symbol: "FUTU",
    name: "Futu Holdings - Robinhood Token",
    address: "0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D",
    decimals: 18,
    isin: "US36118L1061"
  },
  {
    symbol: "GE",
    name: "General Electric - Robinhood Token",
    address: "0x63b814DDBd6BF339f25Fed8c36158a008D5B373e",
    decimals: 18,
    isin: "US3696043013"
  },
  {
    symbol: "GEV",
    name: "GE Vernova - Robinhood Token",
    address: "0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9",
    decimals: 18,
    isin: "US36828A1016"
  },
  {
    symbol: "GLD",
    name: "SPDR Gold Trust - Robinhood Token",
    address: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e",
    decimals: 18,
    isin: "US78463V1070"
  },
  {
    symbol: "GLW",
    name: "Corning - Robinhood Token",
    address: "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6",
    decimals: 18,
    isin: "US2193501051"
  },
  {
    symbol: "GLXY",
    name: "Galaxy Digital Inc. - Robinhood Token",
    address: "0x2D427692E928fa156ec22acfaBaFA0447C5805B7",
    decimals: 18,
    isin: "US36317J2096"
  },
  {
    symbol: "GME",
    name: "GameStop - Robinhood Token",
    address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E",
    decimals: 18,
    isin: "US36467W1099"
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Class A - Robinhood Token",
    address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    decimals: 18,
    isin: "US02079K3059"
  },
  {
    symbol: "HII",
    name: "Huntington Ingalls - Robinhood Token",
    address: "0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D",
    decimals: 18,
    isin: "US4464131063"
  },
  {
    symbol: "HIMS",
    name: "Hims & Hers Health - Robinhood Token",
    address: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09",
    decimals: 18,
    isin: "US4330001060"
  },
  {
    symbol: "HPE",
    name: "HP Enterprise - Robinhood Token",
    address: "0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1",
    decimals: 18,
    isin: "US42824C1099"
  },
  {
    symbol: "HWM",
    name: "Howmet Aerospace - Robinhood Token",
    address: "0xAEa445c5F3DB1a462998ccC422A875A361ee5d99",
    decimals: 18,
    isin: "US4432011082"
  },
  {
    symbol: "IBM",
    name: "IBM - Robinhood Token",
    address: "0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619",
    decimals: 18,
    isin: "US4592001014"
  },
  {
    symbol: "IBRX",
    name: "ImmunityBio, - Robinhood Token",
    address: "0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf",
    decimals: 18,
    isin: "US45256X1037"
  },
  {
    symbol: "INDA",
    name: "iShares MSCI India ETF - Robinhood Token",
    address: "0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6",
    decimals: 18,
    isin: "US46429B5984"
  },
  {
    symbol: "INFQ",
    name: "Infleqtion - Robinhood Token",
    address: "0xB853bC83a753342a4f8320ea680b4B1E84118D21",
    decimals: 18,
    isin: "US45676K1034"
  },
  {
    symbol: "INOD",
    name: "Innodata - Robinhood Token",
    address: "0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6",
    decimals: 18,
    isin: "US4576422053"
  },
  {
    symbol: "INTC",
    name: "Intel - Robinhood Token",
    address: "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681",
    decimals: 18,
    isin: "US4581401001"
  },
  {
    symbol: "INTU",
    name: "Intuit - Robinhood Token",
    address: "0x56d23beE5f41A7120170b0c603Dae30128e460e9",
    decimals: 18,
    isin: "US4612021034"
  },
  {
    symbol: "IONQ",
    name: "IonQ - Robinhood Token",
    address: "0x558378E000D634A36593E338eBacdd6207640EfE",
    decimals: 18,
    isin: "US46222L1089"
  },
  {
    symbol: "IREN",
    name: "IREN Limited - Robinhood Token",
    address: "0xF0AB0c93bE6F41369d302e55db1A96b3c430212D",
    decimals: 18,
    isin: "AU0000185993"
  },
  {
    symbol: "JBL",
    name: "Jabil Inc. - Robinhood Token",
    address: "0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6",
    decimals: 18,
    isin: "US4663131039"
  },
  {
    symbol: "JNJ",
    name: "Johnson & Johnson - Robinhood Token",
    address: "0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80",
    decimals: 18,
    isin: "US4781601046"
  },
  {
    symbol: "JOBY",
    name: "Joby Aviation - Robinhood Token",
    address: "0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24",
    decimals: 18,
    isin: "KYG651631007"
  },
  {
    symbol: "KLAC",
    name: "KLA - Robinhood Token",
    address: "0x96b933C74eCB4A0926b9210cef7b743EF46be2E9",
    decimals: 18,
    isin: "US4824801009"
  },
  {
    symbol: "KSS",
    name: "Kohls Corporation - Robinhood Token",
    address: "0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993",
    decimals: 18,
    isin: "US5002551043"
  },
  {
    symbol: "KTOS",
    name: "Kratos Defense & Security Solutions - Robinhood Token",
    address: "0x7FD06a4d81cCfA3F351394E144d5191874C31313",
    decimals: 18,
    isin: "US50077B2079"
  },
  {
    symbol: "LHX",
    name: "L3Harris - Robinhood Token",
    address: "0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25",
    decimals: 18,
    isin: "US5024311095"
  },
  {
    symbol: "LITE",
    name: "Lumentum - Robinhood Token",
    address: "0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C",
    decimals: 18,
    isin: "US55024U1097"
  },
  {
    symbol: "LLY",
    name: "Eli Lilly - Robinhood Token",
    address: "0x8005d266423c7ea827372c9c864491e5786600ea",
    decimals: 18,
    isin: "US5324571083"
  },
  {
    symbol: "LMT",
    name: "Lockheed - Robinhood Token",
    address: "0x329fcACEb9AD6F9580DD5F643fed0646900D043c",
    decimals: 18,
    isin: "US5398301094"
  },
  {
    symbol: "LRCX",
    name: "Lam Research Corp - Robinhood Token",
    address: "0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4",
    decimals: 18,
    isin: "US5128073062"
  },
  {
    symbol: "LULU",
    name: "Lululemon - Robinhood Token",
    address: "0x4e62068525Ab11FE768e29dfD00ef909B9803016",
    decimals: 18,
    isin: "US5500211090"
  },
  {
    symbol: "LUNR",
    name: "Intuitive Machines - Robinhood Token",
    address: "0xa5D4968421bA94814Be3B136b15cf422101aC1a3",
    decimals: 18,
    isin: "US46125A1007"
  },
  {
    symbol: "MDB",
    name: "MongoDB - Robinhood Token",
    address: "0xDdf2266b79abf0B48898959B0ed6E6adf512be74",
    decimals: 18,
    isin: "US60937P1066"
  },
  {
    symbol: "META",
    name: "Meta Platforms - Robinhood Token",
    address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    decimals: 18,
    isin: "US30303M1027"
  },
  {
    symbol: "MOD",
    name: "Modine - Robinhood Token",
    address: "0xc6Cbad1016b38B797610c25E1dc7D95988B1f362",
    decimals: 18,
    isin: "US6078281002"
  },
  {
    symbol: "MPWR",
    name: "Monolithic Power Systems - Robinhood Token",
    address: "0x52D50D0280AD1054b43f052bD70a49a212A1b128",
    decimals: 18,
    isin: "US6098391054"
  },
  {
    symbol: "MRNA",
    name: "Moderna - Robinhood Token",
    address: "0x43B07D15cE533bEc5476d70C22a78a1B2B662155",
    decimals: 18,
    isin: "US60770K1079"
  },
  {
    symbol: "MRVL",
    name: "Marvell Technology - Robinhood Token",
    address: "0x62fd0668e10D8B72339BE2DCF7643001688ff13B",
    decimals: 18,
    isin: "US5738741041"
  },
  {
    symbol: "MSFT",
    name: "Microsoft - Robinhood Token",
    address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
    decimals: 18,
    isin: "US5949181045"
  },
  {
    symbol: "MSTR",
    name: "Strategy Inc. - Robinhood Token",
    address: "0xec262a75e413fAfD0dF80480274532C79D42da09",
    decimals: 18,
    isin: "US5949724083"
  },
  {
    symbol: "MTSI",
    name: "MACOM - Robinhood Token",
    address: "0xC93f4d80e268AB922e871bd169156C3CC41894e6",
    decimals: 18,
    isin: "US55405Y1001"
  },
  {
    symbol: "MU",
    name: "Micron Technology - Robinhood Token",
    address: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD",
    decimals: 18,
    isin: "US5951121038"
  },
  {
    symbol: "MXL",
    name: "MaxLinear - Robinhood Token",
    address: "0x48961813349333209994750ffA89b3c5C22eC969",
    decimals: 18,
    isin: "US57776J1007"
  },
  {
    symbol: "NAVN",
    name: "Navan - Robinhood Token",
    address: "0xf7181b63Fdb858558A74ba96BC42732684cd7965",
    decimals: 18,
    isin: "US6391931010"
  },
  {
    symbol: "NBIS",
    name: "Nebius Group - Robinhood Token",
    address: "0x9D9c6684F596F66a64C030B93A886D51Fd4D7931",
    decimals: 18,
    isin: "NL0009805522"
  },
  {
    symbol: "NET",
    name: "Cloudflare - Robinhood Token",
    address: "0x116F00968269B7bfbaD4109cE591d6E74c0601d4",
    decimals: 18,
    isin: "US18915M1071"
  },
  {
    symbol: "NFLX",
    name: "Netflix - Robinhood Token",
    address: "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8",
    decimals: 18,
    isin: "US64110L1061"
  },
  {
    symbol: "NNE",
    name: "Nano Nuclear Energy - Robinhood Token",
    address: "0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926",
    decimals: 18,
    isin: "US63010H1086"
  },
  {
    symbol: "NOW",
    name: "ServiceNow - Robinhood Token",
    address: "0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14",
    decimals: 18,
    isin: "US81762P1021"
  },
  {
    symbol: "NU",
    name: "Nu - Robinhood Token",
    address: "0x408c14038a04f7bD235329E26d2bf569ee20e250",
    decimals: 18,
    isin: "KYG6683N1034"
  },
  {
    symbol: "NVDA",
    name: "NVIDIA - Robinhood Token",
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    decimals: 18,
    isin: "US67066G1040"
  },
  {
    symbol: "NVTS",
    name: "Navitas Semiconductor - Robinhood Token",
    address: "0xbE6702d7b70315376dC48a3293f24f0982F86386",
    decimals: 18,
    isin: "US63942X1063"
  },
  {
    symbol: "OKLO",
    name: "Oklo - Robinhood Token",
    address: "0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774",
    decimals: 18,
    isin: "US02156V1098"
  },
  {
    symbol: "ON",
    name: "ON Semiconductor - Robinhood Token",
    address: "0xbBD09F72b025360FeE5C928053Dca6248d35be54",
    decimals: 18,
    isin: "US6821891057"
  },
  {
    symbol: "ONTO",
    name: "Onto Innovation - Robinhood Token",
    address: "0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef",
    decimals: 18,
    isin: "US6833441057"
  },
  {
    symbol: "ORCL",
    name: "Oracle - Robinhood Token",
    address: "0xb0992820E760d836549ba69BC7598b4af75dEE03",
    decimals: 18,
    isin: "US68389X1054"
  },
  {
    symbol: "OUST",
    name: "Ouster - Robinhood Token",
    address: "0x40E7a279850e443f582059ae5dC1c3b6563E6395",
    decimals: 18,
    isin: "US68989M2026"
  },
  {
    symbol: "P",
    name: "Everpure - Robinhood Token",
    address: "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D",
    decimals: 18,
    isin: "US74624M1027"
  },
  {
    symbol: "PANW",
    name: "Palo Alto Networks - Robinhood Token",
    address: "0xB039597eD45CBa7B6E2fb9E8BE51802969CEe5Be",
    decimals: 18,
    isin: "US6974351057"
  },
  {
    symbol: "PATH",
    name: "UiPath - Robinhood Token",
    address: "0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa",
    decimals: 18,
    isin: "US90364P1057"
  },
  {
    symbol: "PENG",
    name: "Penguin Solutions - Robinhood Token",
    address: "0x9b23573b156B52565012F5cE02CDF60AFBaa70Be",
    decimals: 18,
    isin: "US7069151055"
  },
  {
    symbol: "PFE",
    name: "Pfizer - Robinhood Token",
    address: "0x7066A64c24e4206CD62E83bf198c1E7EB361F51e",
    decimals: 18,
    isin: "US7170811035"
  },
  {
    symbol: "PL",
    name: "Planet Labs - Robinhood Token",
    address: "0xAA4d64474c172010aB57719cb9951E6142a100d3",
    decimals: 18,
    isin: "US72703X1063"
  },
  {
    symbol: "PLTR",
    name: "Palantir Technologies - Robinhood Token",
    address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A",
    decimals: 18,
    isin: "US69608A1088"
  },
  {
    symbol: "POET",
    name: "POET Technologies - Robinhood Token",
    address: "0xcf6B2D875361be807EAfa57458c80f28521F9333",
    decimals: 18,
    isin: "CA73044W3021"
  },
  {
    symbol: "POWL",
    name: "Powell Industries - Robinhood Token",
    address: "0x237c16D66590F67B886d978ACD362EAeaD8B18c7",
    decimals: 18,
    isin: "US7391281067"
  },
  {
    symbol: "PR",
    name: "Permian Resources - Robinhood Token",
    address: "0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C",
    decimals: 18,
    isin: "US71424F1057"
  },
  {
    symbol: "PWR",
    name: "Quanta - Robinhood Token",
    address: "0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD",
    decimals: 18,
    isin: "US74762E1029"
  },
  {
    symbol: "QBTS",
    name: "D-Wave Quantum Inc. Common Stock - Robinhood Token",
    address: "0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc",
    decimals: 18,
    isin: "US26740W1099"
  },
  {
    symbol: "QCOM",
    name: "Qualcomm - Robinhood Token",
    address: "0x0f17206447090e464C277571124dD2688E48AEA9",
    decimals: 18,
    isin: "US7475251036"
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ - Robinhood Token",
    address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68",
    decimals: 18,
    isin: "US46090E1038"
  },
  {
    symbol: "QUBT",
    name: "Quantum Computing - Robinhood Token",
    address: "0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4",
    decimals: 18,
    isin: "US74766W1080"
  },
  {
    symbol: "RBLX",
    name: "Roblox - Robinhood Token",
    address: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8",
    decimals: 18,
    isin: "US7710491033"
  },
  {
    symbol: "RCAT",
    name: "Red Cat - Robinhood Token",
    address: "0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460",
    decimals: 18,
    isin: "US75644T1007"
  },
  {
    symbol: "RDDT",
    name: "Reddit - Robinhood Token",
    address: "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C",
    decimals: 18,
    isin: "US75734B1008"
  },
  {
    symbol: "RDW",
    name: "Redwire - Robinhood Token",
    address: "0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE",
    decimals: 18,
    isin: "US75776W1036"
  },
  {
    symbol: "RGTI",
    name: "Rigetti Computing - Robinhood Token",
    address: "0x284358abc07F9359f19f4b5b4aC91901Be2597Ba",
    decimals: 18,
    isin: "US76655K1034"
  },
  {
    symbol: "RIVN",
    name: "Rivian Automotive - Robinhood Token",
    address: "0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B",
    decimals: 18,
    isin: "US76954A1034"
  },
  {
    symbol: "RKLB",
    name: "Rocket Lab Corporation - Robinhood Token",
    address: "0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2",
    decimals: 18,
    isin: "US7731211089"
  },
  {
    symbol: "RUN",
    name: "Sunrun - Robinhood Token",
    address: "0x756Bc80af765C82da966a788858d65aDF14f3793",
    decimals: 18,
    isin: "US86771W1053"
  },
  {
    symbol: "SATS",
    name: "EchoStar - Robinhood Token",
    address: "0x95052ddcd5DC25641657424A8Cf04834997E1730",
    decimals: 18,
    isin: "US2787681061"
  },
  {
    symbol: "SCHD",
    name: "Schwab US Dividend Equity ETF - Robinhood Token",
    address: "0xd63ABB2C13d7a8421a8017a712802053568e3C1D",
    decimals: 18,
    isin: "US8085247976"
  },
  {
    symbol: "SGOV",
    name: "iShares 0-3 Month Treasury Bond - Robinhood Token",
    address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5",
    decimals: 18,
    isin: "US46436E7186"
  },
  {
    symbol: "SHOP",
    name: "Shopify - Robinhood Token",
    address: "0xF53F66751B1Eff985311b693531E3290F600c410",
    decimals: 18,
    isin: "CA82509L1076"
  },
  {
    symbol: "SHY",
    name: "iShares 1-3 Year Treasury Bond ETF - Robinhood Token",
    address: "0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8",
    decimals: 18,
    isin: "US4642874576"
  },
  {
    symbol: "SIMO",
    name: "Silicon Motion - Robinhood Token",
    address: "0x77E655E37F4d913fB9540e0d541D824171a60e81",
    decimals: 18,
    isin: "US82706C1080"
  },
  {
    symbol: "SKHY",
    name: "SK hynix Inc. American Depositary Shares - Robinhood Token",
    address: "0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8",
    decimals: 18,
    isin: "US78392B2060"
  },
  {
    symbol: "SLS",
    name: "SELLAS Life Sciences - Robinhood Token",
    address: "0x285b231728c7E4333799183DF1094d775246a535",
    decimals: 18,
    isin: "US81642T2096"
  },
  {
    symbol: "SLV",
    name: "iShares Silver Trust - Robinhood Token",
    address: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f",
    decimals: 18,
    isin: "US46428Q1094"
  },
  {
    symbol: "SMCI",
    name: "Super Micro Computer - Robinhood Token",
    address: "0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a",
    decimals: 18,
    isin: "US86800U3023"
  },
  {
    symbol: "SMH",
    name: "VanEck Semiconductor ETF - Robinhood Token",
    address: "0x072f979c2CAc8e1391B0162a87Fee094bF8744a0",
    decimals: 18,
    isin: "US92189F6768"
  },
  {
    symbol: "SMR",
    name: "NuScale Power - Robinhood Token",
    address: "0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6",
    decimals: 18,
    isin: "US67079K1007"
  },
  {
    symbol: "SNAP",
    name: "Snap - Robinhood Token",
    address: "0xF6589F11Bc40b669e584073F428B05562F568733",
    decimals: 18,
    isin: "US83304A1060"
  },
  {
    symbol: "SNDK",
    name: "Sandisk Corporation - Robinhood Token",
    address: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400",
    decimals: 18,
    isin: "US80004C2008"
  },
  {
    symbol: "SNOW",
    name: "Snowflake - Robinhood Token",
    address: "0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E",
    decimals: 18,
    isin: "US8334451098"
  },
  {
    symbol: "SOFI",
    name: "SoFi Technologies - Robinhood Token",
    address: "0x98E75885157C80992A8D41b696D8c9C6Fb30A926",
    decimals: 18,
    isin: "US83406F1021"
  },
  {
    symbol: "SOUN",
    name: "SoundHound AI - Robinhood Token",
    address: "0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54",
    decimals: 18,
    isin: "US8361001071"
  },
  {
    symbol: "SOXX",
    name: "iShares Semiconductor ETF - Robinhood Token",
    address: "0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38",
    decimals: 18,
    isin: "US4642875235"
  },
  {
    symbol: "SPCX",
    name: "Space Exploration Technologies Corp. Class A Common Stock - Robinhood Token",
    address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    decimals: 18,
    isin: "US84615Q1031"
  },
  {
    symbol: "SPMO",
    name: "Invesco S&P 500 Momentum ETF - Robinhood Token",
    address: "0xAd622320e520de39e72d41EF07438C3Fd3354875",
    decimals: 18,
    isin: "US46138E3392"
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust - Robinhood Token",
    address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    decimals: 18,
    isin: "US78462F1030"
  },
  {
    symbol: "TE",
    name: "T1 Energy - Robinhood Token",
    address: "0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D",
    decimals: 18,
    isin: "US35834F1049"
  },
  {
    symbol: "TEAM",
    name: "Atlassian Corporation - Robinhood Token",
    address: "0x5B97476b922F3305131B8f0B9D333172E87f4aaE",
    decimals: 18,
    isin: "US0494681010"
  },
  {
    symbol: "TEM",
    name: "Tempus AI - Robinhood Token",
    address: "0xB1CC0EC7Db69Cf43539119814df40071b9d61793",
    decimals: 18,
    isin: "US88023B1035"
  },
  {
    symbol: "TER",
    name: "Teradyne - Robinhood Token",
    address: "0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9C",
    decimals: 18,
    isin: "US8807701029"
  },
  {
    symbol: "TSEM",
    name: "Tower Semiconductor - Robinhood Token",
    address: "0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a",
    decimals: 18,
    isin: "IL0010823792"
  },
  {
    symbol: "TSLA",
    name: "Tesla - Robinhood Token",
    address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    decimals: 18,
    isin: "US88160R1014"
  },
  {
    symbol: "TSM",
    name: "Taiwan Semiconductor Manufacturing - Robinhood Token",
    address: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA",
    decimals: 18,
    isin: "US8740391003"
  },
  {
    symbol: "TTD",
    name: "Trade Desk - Robinhood Token",
    address: "0x0b5fb4031cae9163db10B169Ee72685F0EdC8545",
    decimals: 18,
    isin: "US88339J1051"
  },
  {
    symbol: "TTWO",
    name: "Take-Two Interactive Software - Robinhood Token",
    address: "0x5e81213613b6B86EaB4c6c50d718d34359459786",
    decimals: 18,
    isin: "US8740541094"
  },
  {
    symbol: "UMC",
    name: "United Microelectronics - Robinhood Token",
    address: "0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79",
    decimals: 18,
    isin: "US9108734057"
  },
  {
    symbol: "UNH",
    name: "UnitedHealth - Robinhood Token",
    address: "0xcF364ea52787e289De6F32077834056E3E70D6A8",
    decimals: 18,
    isin: "US91324P1021"
  },
  {
    symbol: "UPS",
    name: "UPS - Robinhood Token",
    address: "0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2",
    decimals: 18,
    isin: "US9113121068"
  },
  {
    symbol: "USAR",
    name: "USA Rare Earth - Robinhood Token",
    address: "0xd917B029C761D264c6A312BBbcDA868658eF86a6",
    decimals: 18,
    isin: "US91733P1075"
  },
  {
    symbol: "USO",
    name: "United States Oil Fund - Robinhood Token",
    address: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
    decimals: 18,
    isin: "US91232N2071"
  },
  {
    symbol: "VICR",
    name: "Vicor - Robinhood Token",
    address: "0x6006ed4B2F94110851ff7509D97D034f0EeD9226",
    decimals: 18,
    isin: "US9258151029"
  },
  {
    symbol: "VRT",
    name: "Vertiv - Robinhood Token",
    address: "0xFA78C12E6488814A0262E4e802749a4a737d5fB7",
    decimals: 18,
    isin: "US92537N1081"
  },
  {
    symbol: "VSAT",
    name: "ViaSat - Robinhood Token",
    address: "0x26dCbfb34FC83CAbD6990f449674efDc6097fF85",
    decimals: 18,
    isin: "US92552V1008"
  },
  {
    symbol: "VST",
    name: "Vistra - Robinhood Token",
    address: "0x561e2a49212b7cCF47f2744Ccb83e200722fADBc",
    decimals: 18,
    isin: "US92840M1027"
  },
  {
    symbol: "VTI",
    name: "Vanguard Morningstar Total Stock Market ETF - Robinhood Token",
    address: "0x0594134DF3f171a354D9C85eBD65b7A6148F6D09",
    decimals: 18,
    isin: "US9229087690"
  },
  {
    symbol: "WDAY",
    name: "Workday - Robinhood Token",
    address: "0x82DA4646242e1D962e96e932269Dc644c94a9CaA",
    decimals: 18,
    isin: "US98138H1014"
  },
  {
    symbol: "WDC",
    name: "Western Digital - Robinhood Token",
    address: "0xF52597345A8Edf418bc4071b4a35112472277D3e",
    decimals: 18,
    isin: "US9581021055"
  },
  {
    symbol: "WULF",
    name: "TeraWulf - Robinhood Token",
    address: "0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd",
    decimals: 18,
    isin: "US88080T1043"
  },
  {
    symbol: "WYFI",
    name: "WhiteFiber, Inc. - Robinhood Token",
    address: "0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E",
    decimals: 18,
    isin: "KYG961151035"
  },
  {
    symbol: "XLK",
    name: "State Street Technology Select Sector SPDR ETF - Robinhood Token",
    address: "0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43",
    decimals: 18,
    isin: "US81369Y8030"
  },
  {
    symbol: "XNDU",
    name: "Xanadu Quantum - Robinhood Token",
    address: "0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289",
    decimals: 18,
    isin: "CA98390R1029"
  },
  {
    symbol: "XOM",
    name: "ExxonMobil Holdings Corporation - Robinhood Token",
    address: "0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5",
    decimals: 18,
    isin: "US30233Q1085"
  },
  {
    symbol: "ZM",
    name: "Zoom - Robinhood Token",
    address: "0x44c4F142009036cF477eD2d09932051843137CF1",
    decimals: 18,
    isin: "US98980L1017"
  },
  {
    symbol: "ZS",
    name: "Zscaler - Robinhood Token",
    address: "0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7",
    decimals: 18,
    isin: "US98980G1022"
  }
]
);

export const ROBINHOOD_STOCK_TOKEN_COUNT = ROBINHOOD_STOCK_TOKENS.length;

/** @param {string} symbol */
export function robinhoodStockTokenBySymbol(symbol) {
  const needle = String(symbol ?? "").trim().toUpperCase();
  return ROBINHOOD_STOCK_TOKENS.find((asset) => asset.symbol.toUpperCase() === needle) ?? null;
}

/** @param {string} address */
export function robinhoodStockTokenByAddress(address) {
  const needle = String(address ?? "").trim().toLowerCase();
  return ROBINHOOD_STOCK_TOKENS.find((asset) => asset.address.toLowerCase() === needle) ?? null;
}
