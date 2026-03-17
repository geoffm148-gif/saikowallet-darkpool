// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DeployFeeUpgrade
/// @notice Deploys the V2 fee-configurable contract suite:
///         SaikoFeeConfig, SaikoSwapRouterV2, SaikoDarkPoolV4, SaikoPoolFactory

import "forge-std/Script.sol";
import "../src/SaikoFeeConfig.sol";
import "../src/SaikoSwapRouterV2.sol";
import "../src/SaikoDarkPoolV4.sol";
import "../src/SaikoPoolFactory.sol";

contract DeployFeeUpgrade is Script {
    address constant SAIKO      = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address payable constant TREASURY  = payable(0xCA45AEd3ef3d82c433330b30eFfBc12D2E295586);
    address constant POSEIDON_T3 = 0x29Be4EFaC1FEd6CEce127e1CFcBf3C5596f4270a;
    address constant VERIFIER_V3 = 0xB483068E623E0653bf73DdeaF9892C1d6E1F6E6C;
    address constant STAKING    = 0xEea4779Eb6cd69bBFa636a036E17D7845547E4fE;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy SaikoFeeConfig — treasury address centralised here
        SaikoFeeConfig feeConfig = new SaikoFeeConfig(TREASURY);

        // 2. Deploy SaikoSwapRouterV2
        SaikoSwapRouterV2 routerV2 = new SaikoSwapRouterV2(
            address(feeConfig),
            SAIKO,
            STAKING
        );

        // 3. Deploy SaikoDarkPoolV4
        SaikoDarkPoolV4 darkPoolV4 = new SaikoDarkPoolV4(
            20,
            VERIFIER_V3,
            POSEIDON_T3,
            SAIKO,
            STAKING,
            address(feeConfig)
        );

        // 4. Deploy SaikoPoolFactory
        SaikoPoolFactory poolFactory = new SaikoPoolFactory(
            address(feeConfig),
            STAKING
        );

        vm.stopBroadcast();

        console.log("=== Saiko Fee Upgrade Deployment ===");
        console.log("SaikoFeeConfig:     ", address(feeConfig));
        console.log("SaikoSwapRouterV2:  ", address(routerV2));
        console.log("SaikoDarkPoolV4:    ", address(darkPoolV4));
        console.log("SaikoPoolFactory:   ", address(poolFactory));
        console.log("====================================");
        console.log("Next steps:");
        console.log("  1. Authorise routerV2 on staking");
        console.log("  2. Set darkPoolV4 as pool on staking");
        console.log("  3. Authorise poolFactory pools on staking");
        console.log("  4. Pause old V3 pool and old router");
    }
}
