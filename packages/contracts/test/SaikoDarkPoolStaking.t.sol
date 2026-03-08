// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SaikoDarkPool.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "./mocks/MockERC20.sol";

contract SaikoDarkPoolStakingTest is Test {
    MockERC20 token;
    SaikoDarkPoolStaking staking;
    SaikoDarkPool pool;
    address treasury = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant TIER_1 = 10_000_000e18;

    // Shared nullifiers for reuse across tests
    bytes32 constant NULL_1 = keccak256("secret1");
    bytes32 constant NULL_2 = keccak256("secret2");

    function setUp() public {
        token = new MockERC20("Saiko", "SAIKO");
        staking = new SaikoDarkPoolStaking(address(token), address(0));
        pool = new SaikoDarkPool(address(token), treasury, address(staking));
        staking.setPool(address(pool));
    }

    function _nullifierHash(bytes32 nullifier) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(nullifier));
    }

    function _deposit(address user, bytes32 commitment, bytes32 nullifier) internal {
        token.mint(user, TIER_1);
        vm.startPrank(user);
        token.approve(address(pool), TIER_1);
        pool.deposit(commitment, _nullifierHash(nullifier), TIER_1);
        vm.stopPrank();
    }

    function test_accrueReward_registersNote() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        (uint256 amount, , , , , bool active) = staking.notes(commitment);
        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;
        assertEq(amount, noteAmount);
        assertTrue(active);
    }

    function test_accrueReward_addsToRewardPool() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 stakingFee = (fee * 1000) / 10_000;
        assertEq(staking.rewardPool(), stakingFee);
    }

    function test_earned_zeroImmediately() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        assertEq(staking.earned(commitment), 0);
    }

    function test_earned_increasesOverTime() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        // Warp forward 1 day
        vm.warp(block.timestamp + 86400);

        uint256 reward = staking.earned(commitment);
        assertGt(reward, 0);
    }

    function test_twoDepositors_shareProportionally() public {
        bytes32 c1 = keccak256("note1");
        bytes32 c2 = keccak256("note2");

        _deposit(alice, c1, NULL_1);
        _deposit(bob, c2, NULL_2);

        // Warp forward 1 day
        vm.warp(block.timestamp + 86400);

        uint256 e1 = staking.earned(c1);
        uint256 e2 = staking.earned(c2);

        // Both have same stake, so rewards should be equal (within rounding)
        assertApproxEqAbs(e1, e2, 1e18);
    }

    function test_claimManual_transfersAndZeroes() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        vm.warp(block.timestamp + 86400);

        uint256 expectedReward = staking.earned(commitment);
        assertGt(expectedReward, 0);

        uint256 balBefore = token.balanceOf(alice);
        staking.claimManual(commitment, NULL_1, alice);
        uint256 balAfter = token.balanceOf(alice);

        assertGe(balAfter - balBefore, expectedReward - 1); // allow rounding
        assertEq(staking.earned(commitment), 0);
    }

    function test_claimReward_deactivatesNote() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        vm.warp(block.timestamp + 86400);

        pool.withdraw(NULL_1, commitment, alice);

        (, , , , , bool active) = staking.notes(commitment);
        assertFalse(active);
    }

    function test_totalStaked_updates() public {
        bytes32 c1 = keccak256("note1");
        _deposit(alice, c1, NULL_1);

        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;
        assertEq(staking.totalStaked(), noteAmount);

        bytes32 c2 = keccak256("note2");
        _deposit(bob, c2, NULL_2);
        assertEq(staking.totalStaked(), noteAmount * 2);

        // Withdraw first note
        pool.withdraw(NULL_1, c1, alice);
        assertEq(staking.totalStaked(), noteAmount);
    }

    function test_claimManual_inactiveNote_reverts() public {
        bytes32 commitment = keccak256("note1");
        _deposit(alice, commitment, NULL_1);

        // Withdraw to deactivate
        pool.withdraw(NULL_1, commitment, alice);

        vm.expectRevert("Note not active");
        staking.claimManual(commitment, NULL_1, alice);
    }
}


