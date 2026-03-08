// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SaikoDarkPoolV2.sol";
import "../src/verifiers/Groth16Verifier.sol";
import "../src/ISaikoDarkPoolStaking.sol";

contract DeployV2 is Script {
    address constant SAIKO_TOKEN = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address constant TREASURY = 0xCA45AEd3ef3d82c433330b30eFfBc12D2E295586;
    address constant STAKING = 0x094aCcB7ad00aD80e520a1a1084aF45d1358cE50;
    address constant ROUTER = 0x9Df6E0652b041A03B5DCb9Be89Ca7DE7C26e4183;

    function run() external {
        // Read PoseidonT3 bytecode from generated JSON
        string memory json = vm.readFile("circuits/build/poseidon-bytecodes.json");
        bytes memory poseidonBytecode = vm.parseJsonBytes(json, ".PoseidonT3.bytecode");

        vm.startBroadcast();

        // 1. Deploy PoseidonT3 using raw bytecode
        address poseidonT3;
        assembly {
            poseidonT3 := create(0, add(poseidonBytecode, 0x20), mload(poseidonBytecode))
        }
        require(poseidonT3 != address(0), "PoseidonT3 deploy failed");

        // 2. Deploy Groth16Verifier
        Groth16Verifier verifier = new Groth16Verifier();

        // 3. Deploy SaikoDarkPoolV2
        SaikoDarkPoolV2 poolV2 = new SaikoDarkPoolV2(
            20,                     // levels
            address(verifier),
            poseidonT3,
            SAIKO_TOKEN,
            TREASURY,
            STAKING
        );

        // 4. Update staking to point to new pool (caller must be staking owner)
        // SaikoDarkPoolStaking(STAKING).setPool(address(poolV2));
        // SaikoDarkPoolStaking(STAKING).setAuthorisedCaller(ROUTER, true);

        vm.stopBroadcast();

        console.log("=== Saiko V2 Deployment Summary ===");
        console.log("PoseidonT3:            ", poseidonT3);
        console.log("Groth16Verifier:       ", address(verifier));
        console.log("SaikoDarkPoolV2:       ", address(poolV2));
        console.log("SaikoToken:            ", SAIKO_TOKEN);
        console.log("Staking (reused):      ", STAKING);
        console.log("Router (reused):       ", ROUTER);
        console.log("Treasury:              ", TREASURY);
        console.log("====================================");
    }
}
