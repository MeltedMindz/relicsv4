// ------------------------------------------------------------------------------------------------
// STATE MACHINE
// ------------------------------------------------------------------------------------------------
export const LAUNCH_STATES = [
    "BRIEF_RECEIVED",
    "PROJECT_SCAFFOLDED",
    "ART_AUTHORED",
    "ART_PROVEN",
    "PROJECT_CONFIGURED",
    "VALIDATED",
    "EXPORTED",
    "CHAIN_SELECTED",
    "CHAIN_PREFLIGHT_PASSED",
    "METADATA_PUBLISHED",
    "PREPARED",
    "PREDICTED",
    "SIMULATED",
    "BUILT",
    "POLICY_APPROVED",
    "SIGNED",
    "BROADCAST",
    "CONFIRMED",
    "VERIFIED",
    "COMPLETE",
];
/** The CLOSED set of things an external coding agent can be told to do next. */
export const NEXT_ACTIONS = [
    "WRITE_ART",
    "FIX_ART",
    "FIX_VALIDATION",
    "CONFIGURE_PROJECT",
    "CONFIGURE_PROVIDER",
    "CONFIGURE_SIGNER",
    "FUND_SIGNER",
    "READY_FOR_PREFLIGHT",
    "READY_FOR_METADATA",
    "READY_FOR_PREPARE",
    "READY_FOR_SIMULATION",
    "READY_FOR_BUILD",
    "READY_FOR_BROADCAST",
    "WAIT_CONFIRMATION",
    "VERIFY",
    "COMPLETE",
    "BLOCKED",
];
/** Documented, stable exit codes. An agent branches on these without reading any text. */
export const EXIT = {
    OK: 0,
    /** A gate refused: the input is wrong and editing files is the remedy. */
    REFUSED: 1,
    /** Usage error — unknown command, bad flag. */
    USAGE: 2,
    /** A live chain fact could not be established. NOT a refusal: nobody was successfully asked. */
    UNKNOWN_CHAIN_STATE: 3,
    /** Policy forbids what was requested. Editing the project will not help; the policy must change. */
    POLICY: 4,
    /** The signer refused. */
    SIGNER_REFUSED: 5,
    /** Work is genuinely blocked on something outside this process (funding, provider, network). */
    BLOCKED: 6,
};
