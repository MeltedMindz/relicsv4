// SPDX-License-Identifier: MIT
// @deprecated G-1 byte-budget meter, kept ONLY for source compatibility with existing G-1 call
// sites (sdk/app/main.ts, sdk/scripts/prove-one-click.ts). Its MEASURED_POINTS table is the PRE-
// INTEGRATION curve (artifacts/gas/g1-1-launch-gas.json), which excludes the organic-TWAP
// oracle's ~678K gas overhead — see that file's own `isolation_note`. NEW callers should use
// `getScriptByteBudget()` / `estimateAtomicLaunchGas()` in gas.ts instead, which gate against the
// correct G-1.1 36,000-byte public ceiling and prefer a REAL live `estimateContractGas` number
// over any static table. This file's `maxScriptBytes` field has been repointed at the correct
// G-1.1 MAX_PROJECT_SCRIPT_BYTES (36,000) so existing UI consumers do not silently show a stale
// (45,500) ceiling; its gas ESTIMATE column remains the stale pre-integration curve/linear fit.
import { ENGINEERING_GAS_CEILING, MAX_PROJECT_SCRIPT_BYTES } from "./constants.js";
const BASELINE_LAUNCH_GAS_ZERO_SCRIPT = 4_004_014;
const MARGINAL_GAS_PER_SCRIPT_BYTE = 218;

/** artifacts/gas/launch-gas.json sizeMatrix + crossoverBand, verbatim (scriptBytes -> totalTx gas). */
const MEASURED_POINTS: { scriptBytes: number; totalTx: number; oneCallGas: number; under14M: boolean }[] = [
  { scriptBytes: 0, totalTx: 4_004_014, oneCallGas: 3_979_118, under14M: true },
  { scriptBytes: 1_000, totalTx: 4_263_143, oneCallGas: 4_222_115, under14M: true },
  { scriptBytes: 8_000, totalTx: 5_783_942, oneCallGas: 5_631_022, under14M: true },
  { scriptBytes: 16_000, totalTx: 7_524_339, oneCallGas: 7_243_407, under14M: true },
  { scriptBytes: 24_000, totalTx: 9_266_263, oneCallGas: 8_857_355, under14M: true },
  { scriptBytes: 32_000, totalTx: 11_042_150, oneCallGas: 10_505_230, under14M: true },
  { scriptBytes: 40_000, totalTx: 12_786_295, oneCallGas: 12_121_363, under14M: true },
  { scriptBytes: 42_000, totalTx: 13_222_622, oneCallGas: 12_525_626, under14M: true },
  { scriptBytes: 44_000, totalTx: 13_658_887, oneCallGas: 12_929_979, under14M: true },
  { scriptBytes: 45_000, totalTx: 13_877_236, oneCallGas: 13_132_208, under14M: true },
  { scriptBytes: 45_500, totalTx: 13_986_227, oneCallGas: 13_233_279, under14M: true },
  { scriptBytes: 46_000, totalTx: 14_095_420, oneCallGas: 13_334_424, under14M: false },
  { scriptBytes: 46_500, totalTx: 14_204_621, oneCallGas: 13_435_577, under14M: false },
  { scriptBytes: 47_000, totalTx: 14_313_617, oneCallGas: 13_536_665, under14M: false },
  { scriptBytes: 48_000, totalTx: 14_531_894, oneCallGas: 13_738_962, under14M: false },
  { scriptBytes: 55_000, totalTx: 16_093_116, oneCallGas: 15_188_152, under14M: false },
];

export type LegacyGasSource = "measured-exact" | "measured-interpolated" | "linear-model";

export interface ByteBudgetReport {
  scriptBytes: number;
  maxScriptBytes: number;
  bytesRemaining: number; // negative when over
  overBudget: boolean;
  fractionOfCeiling: number; // scriptBytes / maxScriptBytes
  estimatedGas: number; // totalTx (one-transaction, receipt-equivalent) estimate
  estimatedGasSource: LegacyGasSource;
  underEngineeringGasCeiling: boolean; // estimatedGas < 14,000,000
  estimatedEthCost: string; // formatted ETH string at the supplied gas price
  gasPriceGwei: number;
}

function linearModelGas(scriptBytes: number): number {
  return BASELINE_LAUNCH_GAS_ZERO_SCRIPT + MARGINAL_GAS_PER_SCRIPT_BYTE * scriptBytes;
}

/** Interpolates/extrapolates totalTx gas for an arbitrary script size from the measured curve. */
export function estimateGasForSize(scriptBytes: number): { gas: number; source: LegacyGasSource } {
  const exact = MEASURED_POINTS.find((p) => p.scriptBytes === scriptBytes);
  if (exact) return { gas: exact.totalTx, source: "measured-exact" };

  const sorted = MEASURED_POINTS;
  const lo = [...sorted].reverse().find((p) => p.scriptBytes < scriptBytes);
  const hi = sorted.find((p) => p.scriptBytes > scriptBytes);
  if (lo && hi) {
    const t = (scriptBytes - lo.scriptBytes) / (hi.scriptBytes - lo.scriptBytes);
    const gas = Math.round(lo.totalTx + t * (hi.totalTx - lo.totalTx));
    return { gas, source: "measured-interpolated" };
  }
  // Outside the measured range entirely: fall back to the linear fit.
  return { gas: Math.round(linearModelGas(scriptBytes)), source: "linear-model" };
}

/**
 * @deprecated use `getScriptByteBudget()` in gas.ts. Reports current script bytes vs the G-1.1
 * public 36,000-byte ceiling, using the STALE pre-integration gas curve/linear fit (see file
 * banner) for the gas estimate/ETH cost projection. `gasPriceGwei` should come from a real read
 * (e.g. the local fork's current base fee) when precision matters; it defaults to 20 gwei purely
 * as an illustrative placeholder for the meter's standalone mode.
 */
export function meterScriptBytes(scriptBytes: number, gasPriceGwei = 20): ByteBudgetReport {
  const maxScriptBytes = MAX_PROJECT_SCRIPT_BYTES;
  const { gas, source } = estimateGasForSize(scriptBytes);
  const gasPriceWei = BigInt(Math.round(gasPriceGwei * 1e9));
  const costWei = BigInt(gas) * gasPriceWei;
  const ethCost = Number(costWei) / 1e18;

  return {
    scriptBytes,
    maxScriptBytes,
    bytesRemaining: maxScriptBytes - scriptBytes,
    overBudget: scriptBytes > maxScriptBytes,
    fractionOfCeiling: scriptBytes / maxScriptBytes,
    estimatedGas: gas,
    estimatedGasSource: source,
    underEngineeringGasCeiling: BigInt(gas) < ENGINEERING_GAS_CEILING,
    estimatedEthCost: `${ethCost.toFixed(6)} ETH`,
    gasPriceGwei,
  };
}
