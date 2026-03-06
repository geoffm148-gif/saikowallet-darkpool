// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SaikoSwapRouter.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "../src/SaikoDarkPool.sol";
import "./mocks/MockERC20.sol";

contract SaikoSwapRouterTest is Test {
    MockERC20 token;
    SaikoDarkPoolStaking staking;
    SaikoDarkPool pool;
    SaikoSwapRouter router;
    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);

    uint256 constant FEE = 1_000_000e18;
    uint256 constant TIER_1 = 10_000_000e18;

    function setUp() public {
        token = new MockERC20("Saiko", "SAIKO");
        staking = new SaikoDarkPoolStaking(address(token), address(0));
        pool = new SaikoDarkPool(address(token), treasury, address(staking));
        staking.setPool(address(pool));
        router = new SaikoSwapRouter(address(token), treasury, address(staking));
        staking.setAuthorisedCaller(address(router), true);
        // Authorise alice for tests
        router.setAuthorisedCaller(alice, true);
    }

    function test_collectFee_splitsCorrectly() public {
        // First deposit a note so commitment exists in staking
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(pool), TIER_1);
        pool.deposit(commitment, nullifierHash, TIER_1);
        vm.stopPrank();

        // Now collect a swap fee with bytes32(0) commitment (all to treasury)
        uint256 treasuryBefore = token.balanceOf(treasury);
        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, bytes32(0));
        vm.stopPrank();

        uint256 stakingShare = (FEE * 1000) / 10_000;
        uint256 treasuryShare = FEE - stakingShare;

        // When commitment is bytes32(0), all goes to treasury
        assertEq(token.balanceOf(treasury) - treasuryBefore, treasuryShare + stakingShare);
    }

    function test_collectFee_zeroCommitment_allToTreasury() public {
        uint256 treasuryBefore = token.balanceOf(treasury);
        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, bytes32(0));
        vm.stopPrank();

        // All fee should go to treasury
        assertEq(token.balanceOf(treasury) - treasuryBefore, FEE);
    }

    function test_collectFee_pullsExactAmount() public {
        token.mint(alice, FEE * 10);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, bytes32(0));
        vm.stopPrank();

        // Alice should still have 9x FEE
        assertEq(token.balanceOf(alice), FEE * 9);
    }
}


