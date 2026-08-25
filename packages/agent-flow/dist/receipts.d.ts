export declare const AGENT_DIR = ".relics-agent";
export declare const RECEIPTS_DIR = "receipts";
export interface ReceiptBody {
    readonly phase: string;
    readonly chainId?: number | null;
    readonly projectBundleHash?: string | null;
    readonly policyHash?: string | null;
    readonly launchPlanHash?: string | null;
    readonly addresses?: Record<string, string>;
    readonly body: unknown;
}
export interface StoredReceipt extends ReceiptBody {
    readonly version: 1;
    readonly timestamp: string;
    readonly inputHash: string;
    readonly outputHash: string;
    readonly previousReceiptHash: string | null;
    readonly sequence: number;
}
/** Stable stringify — sorted keys, bigints as decimal strings — so a hash is over VALUES. */
export declare function canonical(value: unknown): string;
export declare function receiptsPath(workspace: string): string;
/**
 * Every receipt on disk, in sequence order.
 *
 * ORDERED BY THE FILENAME'S NUMERIC PREFIX, not by directory listing order. `readdir` is not sorted
 * on every filesystem, and a chain verified in the wrong order verifies nothing.
 */
export declare function listReceipts(workspace: string): StoredReceipt[];
export declare function hashOfReceipt(r: StoredReceipt): string;
/** Append one receipt, linked to the current tip. */
export declare function writeReceipt(workspace: string, input: ReceiptBody & {
    inputHash?: string;
}): StoredReceipt;
export interface ChainIntegrity {
    readonly intact: boolean;
    readonly length: number;
    readonly brokenAt: number | null;
    readonly detail: string;
}
/**
 * Walk the chain and prove each link. This is what makes an edited receipt detectable: recomputing
 * a receipt's hash and comparing it to what the NEXT one recorded as its predecessor.
 */
export declare function verifyReceiptChain(workspace: string): ChainIntegrity;
/** The most recent receipt for a phase, or null. Used by resume to find where the run got to. */
export declare function latestReceipt(workspace: string, phase: string): StoredReceipt | null;
