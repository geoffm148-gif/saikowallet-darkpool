// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SaikoDarkPool.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "./mocks/MockERC20.sol";

contract SaikoDarkPoolTest is Test {
    MockERC20 token;
    SaikoDarkPoolStaking staking;
    SaikoDarkPool pool;
    address treasury = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant TIER_1 = 10_000_000e18;

    function setUp() public {
        token = new MockERC20("Saiko", "SAIKO");
        staking = new SaikoDarkPoolStaking(address(token), address(0));
        pool = new SaikoDarkPool(address(token), treasury, address(staking));
        staking.setPool(address(pool));
    }

    function _depositAs(
        address user,
        bytes32 commitment,
        bytes32 nullifierHash,
        uint256 amount
    ) internal {
        token.mint(user, amount);
        vm.startPrank(user);
        token.approve(address(pool), amount);
        pool.deposit(commitment, nullifierHash, amount);
        vm.stopPrank();
    }

    // --- deposit tests ---

    function test_deposit_validTier() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        assertTrue(pool.commitments(commitment));
        // noteAmount = TIER_1 - 0.5% fee
        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;
        assertEq(pool.tierBalance(TIER_1), noteAmount);
    }

    function test_deposit_invalidAmount_reverts() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(keccak256("secret1")));
        uint256 badAmount = 999e18;
        token.mint(alice, badAmount);
        vm.startPrank(alice);
        token.approve(address(pool), badAmount);
        vm.expectRevert("Invalid tier");
        pool.deposit(commitment, nullifierHash, badAmount);
        vm.stopPrank();
    }

    function test_deposit_duplicateCommitment_reverts() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier1 = keccak256("secret1");
        bytes32 nullifierHash1 = keccak256(abi.encodePacked(nullifier1));
        _depositAs(alice, commitment, nullifierHash1, TIER_1);

        bytes32 nullifier2 = keccak256("secret2");
        bytes32 nullifierHash2 = keccak256(abi.encodePacked(nullifier2));
        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(pool), TIER_1);
        vm.expectRevert("Commitment exists");
        pool.deposit(commitment, nullifierHash2, TIER_1);
        vm.stopPrank();
    }

    function test_deposit_feeSplit() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        uint256 treasuryBefore = token.balanceOf(treasury);

        _depositAs(alice, commitment, nullifierHash, TIER_1);

        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 stakingFee = (fee * 1000) / 10_000;
        uint256 treasuryFee = fee - stakingFee;

        assertEq(token.balanceOf(treasury) - treasuryBefore, treasuryFee);
        assertEq(token.balanceOf(address(staking)), stakingFee);
    }

    // --- withdraw tests ---

    function test_withdraw_valid() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;

        vm.prank(bob);
        pool.withdraw(nullifier, commitment, bob);

        assertTrue(pool.nullifierSpent(nullifierHash));
        assertEq(pool.tierBalance(TIER_1), 0);
        // Bob should have received the noteAmount (plus any staking rewards)
        assertGe(token.balanceOf(bob), noteAmount);
    }

    function test_withdraw_doubleSpend_reverts() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        vm.prank(bob);
        pool.withdraw(nullifier, commitment, bob);

        vm.prank(bob);
        vm.expectRevert("Note already spent");
        pool.withdraw(nullifier, commitment, bob);
    }

    function test_withdraw_toDifferentAddress() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        address recipient = address(0xCAFE);
        vm.prank(alice);
        pool.withdraw(nullifier, commitment, recipient);

        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;
        assertGe(token.balanceOf(recipient), noteAmount);
    }

    function test_withdraw_noCommitment_reverts() public {
        bytes32 commitment = keccak256("nonexistent");
        bytes32 nullifier = keccak256("secret1");

        vm.expectRevert("No such commitment");
        pool.withdraw(nullifier, commitment, alice);
    }

    // --- pause tests ---

    function test_pause_onlyOwner() public {
        pool.pause();
        assertTrue(pool.paused());

        bytes32 commitment = keccak256("note1");
        bytes32 nullifierHash = keccak256(abi.encodePacked(keccak256("secret1")));
        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(pool), TIER_1);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        pool.deposit(commitment, nullifierHash, TIER_1);
        vm.stopPrank();

        pool.unpause();
        assertFalse(pool.paused());
    }

    function test_pause_nonOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        pool.pause();
    }

    // --- tier balance ---

    function test_tierBalance_updatesOnDepositAndWithdraw() public {
        bytes32 c1 = keccak256("note1");
        bytes32 n1 = keccak256("secret1");
        bytes32 nh1 = keccak256(abi.encodePacked(n1));
        bytes32 c2 = keccak256("note2");
        bytes32 n2 = keccak256("secret2");
        bytes32 nh2 = keccak256(abi.encodePacked(n2));

        _depositAs(alice, c1, nh1, TIER_1);
        _depositAs(bob, c2, nh2, TIER_1);

        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;
        assertEq(pool.tierBalance(TIER_1), noteAmount * 2);

        pool.withdraw(n1, c1, alice);
        assertEq(pool.tierBalance(TIER_1), noteAmount);
    }
}

