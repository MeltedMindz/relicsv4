# 13 — Mining the hook address

A v4 hook must live at an address whose **low 14 bits equal its permission flags**. This
starter's hook uses `afterInitialize | afterAddLiquidity | afterSwap`, so its address must end in
the bits `0x1440`.

## CREATE2 recap

CREATE2 deploys to a **deterministic** address:

```
address = keccak256(0xff, deployer, salt, keccak256(initCode))[12:]
```

- `deployer` — the contract that runs CREATE2. For `forge script` broadcasts, use the standard
  deterministic factory `0x4e59b44847b379578588920cA78FbF26c0B4956C`. In `forge test`, `new
  X{salt: s}(...)` uses the current contract (`address(this)`) as the deployer.
- `initCode` — the creation bytecode **concatenated with the ABI-encoded constructor args**.

Because the constructor args are part of `initCode`, **changing any constructor argument changes
every valid salt.** Mine against the exact args you will deploy with.

## Using HookMiner

```solidity
uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG
                        | Hooks.AFTER_SWAP_FLAG); // 0x1440
bytes memory args = abi.encode(poolManager, artToken, hookOwner);
(address hookAddr, bytes32 salt) =
    HookMiner.find(deployer, flags, type(ExampleV4Hook).creationCode, args);
```

`HookMiner.find` loops salts until it finds an address whose low 14 bits match `flags` and which
has no existing code. It returns `(predictedAddress, salt)`.

## Deploying with the mined salt

In a script, deploy through the CREATE2 factory so the address matches what you mined against
`CREATE2_DEPLOYER`:

```solidity
bytes memory initCode = abi.encodePacked(type(ExampleV4Hook).creationCode, args);
(bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
require(ok);
// hook now lives at the predicted address
```

In a test, `new ExampleV4Hook{salt: salt}(...)` works because you mined against `address(this)`.

## Verify the flags

```solidity
require(uint160(address(hook)) & 0x3FFF == 0x1440, "wrong flag bits");
```

`BaseHook`'s constructor already enforces this (`_validateHookAddress`), which is why a plain
`new ExampleV4Hook(...)` at a random address reverts. Run `script/MineHookAddress.s.sol` first to
preview the salt and address.
