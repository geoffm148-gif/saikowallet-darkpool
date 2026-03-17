// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Full redeploy: new Staking (SAIKO+ETH rewards), new DarkPool V2, new Router.
///         Existing SAIKO token, PoseidonT3, Groth16Verifier, and treasury are reused.

import "forge-std/Script.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "../src/SaikoDarkPoolV2.sol";
import "../src/SaikoSwapRouter.sol";

contract DeployEthRewards is Script {
    address constant SAIKO        = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address constant TREASURY     = 0xCA45AEd3ef3d82c433330b30eFfBc12D2E295586;
    address constant POSEIDON_T3  = 0x29Be4EFaC1FEd6CEce127e1CFcBf3C5596f4270a;
    address constant VERIFIER     = 0xB483068E623E0653bf73DdeaF9892C1d6E1F6E6C;
    uint32  constant MERKLE_DEPTH = 20;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy new staking (no pool yet — set after)
        SaikoDarkPoolStaking staking = new SaikoDarkPoolStaking(SAIKO, address(0));

        // 2. Deploy new DarkPool V2 pointing to new staking
        SaikoDarkPoolV2 pool = new SaikoDarkPoolV2(
            MERKLE_DEPTH,
            VERIFIER,
            POSEIDON_T3,
            SAIKO,
            TREASURY,
            address(staking)
        );

        // 3. Deploy new router pointing to new staking
        SaikoSwapRouter router = new SaikoSwapRouter(
            SAIKO,
            payable(TREASURY),
            address(staking)
        );

        // 4. Wire: pool → staking, router → staking
        staking.setPool(address(pool));
        staking.setAuthorisedCaller(address(router), true);

        vm.stopBroadcast();

        console.log("=== ETH Rewards Deployment ===");
        console.log("SaikoDarkPoolStaking (new):", address(staking));
        console.log("SaikoDarkPoolV2 (new):     ", address(pool));
        console.log("SaikoSwapRouter (new):     ", address(router));
        console.log("Verifier (reused):         ", VERIFIER);
        console.log("PoseidonT3 (reused):       ", POSEIDON_T3);
        console.log("SAIKO (reused):            ", SAIKO);
        console.log("Treasury:                  ", TREASURY);
        console.log("==============================");
    }
}
