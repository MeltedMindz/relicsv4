export type LegacyGasSource = "measured-exact" | "measured-interpolated" | "linear-model";
export interface ByteBudgetReport {
    scriptBytes: number;
    maxScriptBytes: number;
    bytesRemaining: number;
    overBudget: boolean;
    fractionOfCeiling: number;
    estimatedGas: number;
    estimatedGasSource: LegacyGasSource;
    underEngineeringGasCeiling: boolean;
    estimatedEthCost: string;
    gasPriceGwei: number;
}
/** Interpolates/extrapolates totalTx gas for an arbitrary script size from the measured curve. */
export declare function estimateGasForSize(scriptBytes: number): {
    gas: number;
    source: LegacyGasSource;
};
/**
 * @deprecated use `getScriptByteBudget()` in gas.ts. Reports current script bytes vs the G-1.1
 * public 36,000-byte ceiling, using the STALE pre-integration gas curve/linear fit (see file
 * banner) for the gas estimate/ETH cost projection. `gasPriceGwei` should come from a real read
 * (e.g. the local fork's current base fee) when precision matters; it defaults to 20 gwei purely
 * as an illustrative placeholder for the meter's standalone mode.
 */
export declare function meterScriptBytes(scriptBytes: number, gasPriceGwei?: number): ByteBudgetReport;
