// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "../src/SaikoDarkPool.sol";
import "../src/SaikoSwapRouter.sol";

contract Deploy is Script {
    address constant TREASURY = 0xCA45AEd3ef3d82c433330b30eFfBc12D2E295586;

    function run() external {
        vm.startBroadcast();

        // 1. Use existing SAIKO token
        IERC20 token = IERC20(0x4c89364F18Ecc562165820989549022e64eC2eD2);

        // 2. Deploy staking (pool not yet known, set later)
        SaikoDarkPoolStaking staking = new SaikoDarkPoolStaking(address(token), address(0));

        // 3. Deploy pool
        SaikoDarkPool pool = new SaikoDarkPool(address(token), TREASURY, address(staking));

        // 4. Deploy router
        SaikoSwapRouter router = new SaikoSwapRouter(address(token), payable(TREASURY), address(staking));

        // 5. Wire cross-references
        staking.setPool(address(pool));
        staking.setAuthorisedCaller(address(router), true);

        vm.stopBroadcast();

        // 6. Deployment summary
        console.log("=== Saiko Deployment Summary ===");
        console.log("SaikoToken:            ", address(token));
        console.log("SaikoDarkPoolStaking:  ", address(staking));
        console.log("SaikoDarkPool:         ", address(pool));
        console.log("SaikoSwapRouter:       ", address(router));
        console.log("Treasury:              ", TREASURY);
        console.log("================================");
    }
}

