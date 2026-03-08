// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SaikoDarkPoolV3.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "../src/SaikoDarkPoolV2.sol";
import "../src/verifiers/Groth16VerifierV3.sol";

contract DeployV3 is Script {
    address constant SAIKO = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address constant TREASURY = 0xCA45AEd3ef3d82c433330b30eFfBc12D2E295586;
    address constant POSEIDON_T3 = 0x29Be4EFaC1FEd6CEce127e1CFcBf3C5596f4270a;
    address constant STAKING = 0xEea4779Eb6cd69bBFa636a036E17D7845547E4fE;
    address constant V2_POOL = 0x6d985d3B7d57c3b6ACd5c275f761bE62b425915b;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy V3 Groth16 verifier
        Groth16VerifierV3 verifierV3 = new Groth16VerifierV3();

        // 2. Deploy SaikoDarkPoolV3
        SaikoDarkPoolV3 v3 = new SaikoDarkPoolV3(
            20,                    // levels
            address(verifierV3),
            POSEIDON_T3,
            SAIKO,
            TREASURY,
            STAKING
        );

        // 3. Wire staking to accept V3 as authorised caller and pool
        SaikoDarkPoolStaking staking = SaikoDarkPoolStaking(payable(STAKING));
        staking.setAuthorisedCaller(address(v3), true);
        staking.setPool(address(v3));

        // 4. Pause V2 pool
        SaikoDarkPoolV2 v2 = SaikoDarkPoolV2(V2_POOL);
        v2.pause();

        vm.stopBroadcast();

        console.log("=== SaikoDarkPool V3 Deployment ===");
        console.log("Groth16VerifierV3: ", address(verifierV3));
        console.log("SaikoDarkPoolV3:   ", address(v3));
        console.log("Staking:           ", STAKING);
        console.log("V2 Pool (paused):  ", V2_POOL);
        console.log("===================================");
    }
}
