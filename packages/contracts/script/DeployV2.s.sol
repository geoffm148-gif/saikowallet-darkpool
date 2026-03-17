// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SaikoFeeConfig.sol";
import "../src/SaikoSwapRouterV2.sol";
import "../src/SaikoDarkPoolV4.sol";
import "../src/SaikoPoolFactory.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "../src/verifiers/Groth16Verifier.sol";

contract DeployContractsV2 is Script {
    // ── Immutable mainnet addresses (infrastructure, not redeployed) ──────
    address constant SAIKO_TOKEN = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address payable constant TREASURY = payable(0xbB54d3350e256D3660Ec35dc87FF52c18f541d6A);
    address constant POSEIDON_T3 = 0x29Be4EFaC1FEd6CEce127e1CFcBf3C5596f4270a;
    address constant VERIFIER    = 0xB483068E623E0653bf73DdeaF9892C1d6E1F6E6C;

    // ── Old staking (V1 — still holds V1/V2/V3 notes, do not touch) ───────
    // address constant OLD_STAKING = 0xEea4779Eb6cd69bBFa636a036E17D7845547E4fE;
    // Owned by old deployer 0xFA2B4cAA3B4723F86e8bCAA9bB5812828d7e55e3.
    // Does not have V2 functions (setPoolFactory, setTreasury, etc).
    // Leave it running — existing note holders can still interact with it.

    function run() external {
        vm.startBroadcast();

        // 1. Deploy fresh SaikoDarkPoolStaking
        //    Starting pool = address(0) — wired to V4 in step 6
        SaikoDarkPoolStaking staking = new SaikoDarkPoolStaking(SAIKO_TOKEN, address(0));
        console.log("SaikoDarkPoolStaking:  ", address(staking));

        // 2. Deploy SaikoFeeConfig — central fee config + treasury address
        SaikoFeeConfig feeConfig = new SaikoFeeConfig(TREASURY);
        console.log("SaikoFeeConfig:        ", address(feeConfig));

        // 3. Deploy SaikoSwapRouterV2
        SaikoSwapRouterV2 routerV2 = new SaikoSwapRouterV2(
            address(feeConfig),
            SAIKO_TOKEN,
            address(staking)
        );
        console.log("SaikoSwapRouterV2:     ", address(routerV2));

        // 4. Deploy SaikoDarkPoolV4
        SaikoDarkPoolV4 poolV4 = new SaikoDarkPoolV4(
            20,             // Merkle tree depth
            VERIFIER,
            POSEIDON_T3,
            SAIKO_TOKEN,
            address(staking),
            address(feeConfig)
        );
        console.log("SaikoDarkPoolV4:       ", address(poolV4));

        // 5. Deploy SaikoPoolFactory
        SaikoPoolFactory factory = new SaikoPoolFactory(
            address(feeConfig),
            address(staking)
        );
        console.log("SaikoPoolFactory:      ", address(factory));

        // ── Wire staking ──────────────────────────────────────────────────

        // 6. Wire factory so createPool() auto-authorises new custom pools
        staking.setPoolFactory(address(factory));
        console.log("Staking.poolFactory -> ", address(factory));

        // 7. Authorise V4 as the primary pool (enables claimReward / deactivateNote)
        staking.setPool(address(poolV4));
        console.log("Staking.pool ->        ", address(poolV4));

        // 8. Authorise router to accrue ETH + SAIKO rewards from swaps
        staking.setAuthorisedCaller(address(routerV2), true);
        console.log("Staking authorised:    ", address(routerV2));

        // 9. Set treasury — only address that can call injectPoolReward / fundBonusPool
        staking.setTreasury(TREASURY);
        console.log("Staking.treasury ->    ", TREASURY);

        vm.stopBroadcast();

        console.log("\n=== Saiko V2 Deployment Complete ===");
        console.log("SaikoDarkPoolStaking:  ", address(staking));
        console.log("SaikoFeeConfig:        ", address(feeConfig));
        console.log("SaikoSwapRouterV2:     ", address(routerV2));
        console.log("SaikoDarkPoolV4:       ", address(poolV4));
        console.log("SaikoPoolFactory:      ", address(factory));
        console.log("--- Unchanged ---");
        console.log("SaikoToken:            ", SAIKO_TOKEN);
        console.log("Treasury:              ", TREASURY);
        console.log("PoseidonT3:            ", POSEIDON_T3);
        console.log("Verifier:              ", VERIFIER);
        console.log("=====================================");
        console.log("\nNext steps:");
        console.log("1. Update wallet-core constants.ts with all 5 new addresses");
        console.log("2. Update darkpool-dapp constants.ts with all 5 new addresses");
        console.log("3. Copy circuits into darkpool-dapp/public/circuits/");
        console.log("4. Transfer staking ownership from deployer to multisig/treasury (recommended)");
    }
}
