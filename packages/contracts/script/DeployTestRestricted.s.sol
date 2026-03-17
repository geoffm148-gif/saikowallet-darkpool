// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DeployTestRestricted
/// @notice Deploys a whitelist-only, small-amount test version of the Saiko V2 suite.
///         Only the deployer wallet can interact. ZK proofs are skipped in the dark pool.
///         Used for thorough on-chain functional testing before public launch.

import "forge-std/Script.sol";
import "../src/SaikoFeeConfig.sol";
import "../src/SaikoSwapRouterV2.sol";
import "../src/SaikoDarkPoolV4Restricted.sol";
import "../src/SaikoPoolFactory.sol";
import "../src/ISaikoDarkPoolStaking.sol";

interface IStakingAdmin {
    function setPool(address pool) external;
    function setAuthorisedCaller(address caller, bool status) external;
}

contract DeployTestRestricted is Script {
    // ── Existing mainnet contracts (reused) ────────────────────────────────
    address constant SAIKO_TOKEN   = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address constant POSEIDON_T3   = 0x29Be4EFaC1FEd6CEce127e1CFcBf3C5596f4270a;
    address constant STAKING       = 0xEea4779Eb6cd69bBFa636a036E17D7845547E4fE;
    address constant DEPLOYER      = 0xFA2B4cAA3B4723F86e8bCAA9bB5812828d7e55e3;

    // ── Test tier amounts (small — 100 / 1K / 10K / 100K SAIKO) ──────────
    uint256 constant TIER_1 =     100e18;
    uint256 constant TIER_2 =   1_000e18;
    uint256 constant TIER_3 =  10_000e18;
    uint256 constant TIER_4 = 100_000e18;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(deployerKey);

        // 1. FeeConfig — treasury = deployer for test
        SaikoFeeConfig feeConfig = new SaikoFeeConfig(payable(DEPLOYER));
        console.log("SaikoFeeConfig:              ", address(feeConfig));

        // 2. SwapRouterV2 — only deployer authorised as caller
        SaikoSwapRouterV2 router = new SaikoSwapRouterV2(
            address(feeConfig),
            SAIKO_TOKEN,
            STAKING
        );
        router.setAuthorisedCaller(DEPLOYER, true);
        console.log("SaikoSwapRouterV2:           ", address(router));

        // 3. Restricted DarkPool — small tiers, no ZK proof, deployer-only whitelist
        SaikoDarkPoolV4Restricted darkPool = new SaikoDarkPoolV4Restricted(
            20,           // Merkle tree depth
            POSEIDON_T3,
            SAIKO_TOKEN,
            STAKING,
            address(feeConfig),
            TIER_1,
            TIER_2,
            TIER_3,
            TIER_4
        );
        console.log("SaikoDarkPoolV4Restricted:   ", address(darkPool));

        // 4. Wire staking contract to accept calls from test dark pool
        //    (Deployer is owner of the staking contract)
        IStakingAdmin(STAKING).setPool(address(darkPool));
        IStakingAdmin(STAKING).setAuthorisedCaller(address(darkPool), true);
        console.log("Staking wired to test darkpool");

        // 5. PoolFactory — deployer is owner, controls pool creation
        SaikoPoolFactory factory = new SaikoPoolFactory(
            address(feeConfig),
            STAKING
        );
        console.log("SaikoPoolFactory:            ", address(factory));

        vm.stopBroadcast();

        console.log("\n=== TEST DEPLOYMENT SUMMARY ===");
        console.log("Network:       Mainnet (restricted test)");
        console.log("Deployer:      ", DEPLOYER);
        console.log("FeeConfig:     ", address(feeConfig));
        console.log("RouterV2:      ", address(router));
        console.log("DarkPool:      ", address(darkPool));
        console.log("Factory:       ", address(factory));
        console.log("Tiers:         100 / 1K / 10K / 100K SAIKO");
        console.log("ZK proofs:     SKIPPED (test mode)");
        console.log("Access:        Deployer-only whitelist");
        console.log("================================");
        console.log("\nTest checklist:");
        console.log("  [ ] Deposit TIER_1 (100 SAIKO) -> verify fee split");
        console.log("  [ ] Withdraw -> verify lockedNoteAmount used, not live fee");
        console.log("  [ ] Change darkpoolFeeBPS -> deposit again -> withdraw -> confirm old notes unaffected");
        console.log("  [ ] createPool(SAIKO, WETH, 100) -> addLiquidity -> swap -> verify fee split");
        console.log("  [ ] setSaikoCustomCut(10000) -> swap -> verify LPs get 0 fee");
        console.log("  [ ] setTreasury(newAddr) -> deposit -> verify fees go to new address");
        console.log("  [ ] setProviderShare(0) -> deposit -> verify 100% to treasury");
        console.log("  [ ] setProviderShare(10000) -> deposit -> verify 100% to staking");
    }
}
