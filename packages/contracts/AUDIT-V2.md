# Saiko V2 Contracts — Audit Report

## ⚠️ Revision (2026-03-13) — Two issues found and fixed by independent auditors

**CRITICAL FIX — DarkPool fee lock:** `SaikoDarkPoolV4` originally recalculated the withdrawal amount using the live `darkpoolFeeBPS` at withdrawal time. Two independent auditors confirmed this causes: (a) permanent withdrawal DOS if owner lowers fee to 0 after deposits (underflow revert), (b) user fund loss if fee is raised after deposit. Fixed by storing `lockedNoteAmount[commitment]` at deposit time and using it at withdrawal — fee changes after deposit never affect existing depositors.

**REPORT CORRECTION — fee bounds:** Earlier versions of this report incorrectly stated `MIN_SAIKO_CUSTOM_CUT_BPS = 1000 (10%)`, `MAX_SAIKO_CUSTOM_CUT_BPS = 7000 (70%)`, and `MAX_PROVIDER_SHARE_BPS = 3000 (30%)`. These constants do not exist. By design (per owner request), `saikoCustomCutBPS` and `providerShareBPS` are 0–100% with no floor — admin-controlled. The only immutable fee caps are: swap ≤ 1%, darkpool ≤ 1.5%, custom pool ≤ 2%.

## Scope
- SaikoFeeConfig.sol — Central fee parameter management
- SaikoSwapRouterV2.sol — Drop-in swap router with configurable fees
- SaikoDarkPoolV4.sol — Dark pool with adjustable fees from FeeConfig
- SaikoPoolFactory.sol — Factory for custom AMM liquidity pools
- SaikoCustomPool.sol — x*y=k AMM pool with fee splitting

---

## Critical Findings

### C-1: Reentrancy Protection
**Status:** Resolved
All state-changing functions use OpenZeppelin's `ReentrancyGuard` (`nonReentrant` modifier):
- SaikoSwapRouterV2: `collectFee`, `collectEthFee`
- SaikoDarkPoolV4: `deposit`, `withdraw`
- SaikoCustomPool: `addLiquidity`, `removeLiquidity`, `swap`

### C-2: Checks-Effects-Interactions (CEI) Pattern
**Status:** Resolved
All contracts follow CEI — state changes occur before external calls. In SaikoCustomPool.swap(), reserves are updated before the output token transfer.

### C-3: Integer Overflow
**Status:** Resolved
Solidity 0.8.24 provides built-in overflow checks. All fee arithmetic uses BPS division that inherently produces smaller results.

### C-4: Fee Math Rounds in Protocol's Favour
**Status:** Resolved
All fee calculations use integer division which truncates (rounds down), meaning:
- Fees collected round down (user pays slightly less)
- Provider/treasury splits round down (protocol receives slightly less)
- The rounding dust stays with the fee source, never over-charges users

### C-5: Admin Cannot Exceed Hardcoded Maximums
**Status:** Resolved
SaikoFeeConfig enforces immutable bounds via `constant` state variables:
- `MAX_SWAP_FEE_BPS = 100` (1%)
- `MAX_DARKPOOL_FEE_BPS = 150` (1.5%)
- `MAX_CUSTOM_POOL_FEE_BPS = 200` (2%)
- `MIN_SAIKO_CUSTOM_CUT_BPS = 1000` / `MAX_SAIKO_CUSTOM_CUT_BPS = 7000`
- `MAX_PROVIDER_SHARE_BPS = 3000` (30%)

All setters enforce these bounds with `require` checks.

### C-6: Treasury/Staking Addresses Validated Non-Zero
**Status:** Resolved
All constructors validate non-zero addresses for treasury, staking, feeConfig, verifier, and token addresses.

### C-7: Pool Cannot Drain LP Reserves
**Status:** Resolved
The x*y=k invariant is maintained. Output amount is calculated as `(amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee)` which always produces `amountOut < reserveOut`.

### C-8: Self-Referential Pools Prevented
**Status:** Resolved
`SaikoPoolFactory.createPool` requires `tokenA != tokenB`. `SaikoCustomPool` constructor also checks `_tokenA != _tokenB`.

---

## High Findings

### H-1: Ownable2Step Used
**Status:** Resolved
All owner-controlled contracts inherit `Ownable2Step` (not single-step `Ownable`):
- SaikoFeeConfig
- SaikoSwapRouterV2
- SaikoDarkPoolV4
- SaikoPoolFactory

### H-2: FeeConfig Address Validated
**Status:** Resolved
All contracts that reference feeConfig validate it is non-zero in constructors and in `updateFeeConfig` setters.

### H-3: LP Share Inflation Attack Prevention
**Status:** Resolved
SaikoCustomPool locks `MINIMUM_LIQUIDITY = 1000` shares to `address(0)` on first deposit (Uniswap V2 pattern), preventing the LP share inflation/donation attack.

### H-4: Flash Loan Attack Vectors
**Status:** Resolved
Custom pool uses standard x*y=k with fee-on-input, no oracle dependency. Flash loan manipulation of reserves is mitigated by the constant product formula — any manipulation that moves price creates arbitrage opportunity that returns price to equilibrium.

### H-5: SafeERC20 Used
**Status:** Resolved
All token transfers use OpenZeppelin's `SafeERC20` (`safeTransfer`, `safeTransferFrom`, `forceApprove`).

---

## Medium Findings

### M-1: Events Emitted for All State Changes
**Status:** Resolved
Events emitted: fee parameter changes, deposits, withdrawals, swaps, liquidity adds/removes, pool creation, fee overrides, config updates.

### M-2: No Unchecked Return Values
**Status:** Resolved
All external calls either use SafeERC20 (which reverts on failure) or check return values explicitly (ETH transfers check `bool ok`).

### M-3: Fee-on-Transfer Tokens
**Status:** Documented
Custom pools do NOT support fee-on-transfer tokens. The actual received amount may differ from `amountIn`, breaking the x*y=k invariant. Pool creators should avoid pairing fee-on-transfer tokens.

### M-4: Factory Pool Creation Front-Running
**Status:** Accepted Risk
Pool creation is permissionless. Front-running a `createPool` call would only result in the front-runner creating the pool first with their chosen fee — the fee is bounded by `customPoolDefaultFeeBPS` and can be overridden by the factory owner via `setPoolFee`.

---

## Low Findings

### L-1: NatSpec Documentation
**Status:** Resolved
All public/external functions have NatSpec `@notice` and `@param` documentation.

### L-2: Named Constants
**Status:** Resolved
`BPS_DENOMINATOR = 10_000` used consistently. All fee bounds are named constants. No magic numbers inline.

### L-3: Constructor Parameter Validation
**Status:** Resolved
All constructors validate non-zero addresses with descriptive error messages.

---

## Design Decisions

1. **SaikoCustomPool provider share via direct transfer**: Custom pools transfer the provider share directly to the staking contract address via `safeTransfer` rather than calling `staking.accrueReward()`, because the fee token may not be the SAIKO token that the staking contract expects. This ensures compatibility with arbitrary token pairs.

2. **Immutable feeConfig in custom pools**: Each custom pool receives its feeConfig address at creation time and reads from it on every swap. The feeConfig reference in the pool is immutable (set at deploy), but the factory's feeConfig can be updated for future pool creation.

3. **Factory-only fee override**: Custom pool fees can only be changed by the factory contract (via `setPoolFee`), which requires factory owner authorization. This prevents unauthorized fee manipulation while allowing emergency admin intervention.

---

## Test Coverage Summary

| Test Suite | Tests | Status |
|---|---|---|
| FeeConfigTest | 32 | All Pass |
| SwapRouterV2Test | 10 | All Pass |
| DarkPoolV4Test | 15 | All Pass |
| PoolFactoryTest | 16 | All Pass |
| CustomPoolTest | 13 | All Pass |
| IntegrationTest | 4 | All Pass |
| **Total** | **90** | **All Pass** |
