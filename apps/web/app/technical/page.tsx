import { collectionConfig } from "@config";

export default function TechnicalPage() {
  return (
    <div>
      <h1>Technical overview</h1>
      <p className="muted">
        Five contracts, one canonical pool, all metadata on chain. This build ships the{" "}
        <code>{collectionConfig.rendererStyle}</code> art system. Full write-ups live in the{" "}
        <code>docs/</code> folder — start with <code>docs/00-make-it-your-own.md</code>.
      </p>

      <h2>Contracts</h2>
      <ul className="tight">
        <li>
          <code>ExampleToken</code> — fixed-supply ERC-20. No tax, no blacklist, no mint after
          construction. Maintains an O(1) active-holder count used as art entropy.
        </li>
        <li>
          <code>ExampleArtNFT</code> — ERC-721 with fully on-chain metadata and ERC-4906 events.
          Receiving tokens does nothing; a holder must explicitly <code>awaken</code>.
        </li>
        <li>
          <code>ExampleV4Hook</code> — observes one canonical pool (afterInitialize +
          afterAddLiquidity + afterSwap) and maintains compact market state. Never renders,
          never loops over NFTs.
        </li>
        <li>
          <code>ExampleOnchainRenderer</code> — pure/view SVG + base64 JSON generator. Neutral
          placeholder visual identity.
        </li>
        <li>
          <code>ImmutablePositionLocker</code> — ownerless custodian of the LP position that
          separates principal finality from fee collection.
        </li>
      </ul>

      <h2>Hook address encodes permissions</h2>
      <p>
        A v4 hook advertises which callbacks it uses through the low bits of its own address.
        This hook needs afterInitialize | afterAddLiquidity | afterSwap, so its address must end
        in the bits <code>0x1440</code>. You mine a CREATE2 salt to find such an address; deploy
        to any other address and the constructor reverts.
      </p>

      <h2>Market state is art entropy, never an oracle</h2>
      <p>
        Swap counts, tick movement, drawdown, and a rolling entropy hash feed the renderer. None
        of it gates a financial outcome. Ticks and volumes are manipulable, especially in shallow
        liquidity — treat them as texture, not truth.
      </p>

      <h2>Twenty lessons</h2>
      <p className="muted">
        See <code>docs/10-twenty-lessons.md</code> for the full list — from &ldquo;read the
        PositionManager token id from the receipt, never a simulation&rdquo; to &ldquo;never
        access browser env dynamically in Next.js.&rdquo;
      </p>
    </div>
  );
}
