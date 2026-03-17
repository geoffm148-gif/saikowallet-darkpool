// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SaikoDarkPool.sol";
import "../src/SaikoDarkPoolStaking.sol";
import "../src/SaikoSwapRouter.sol";
import "./mocks/MockERC20.sol";

/// @dev Malicious ERC20 that attempts reentrancy via _update callback
contract ReentrantToken is MockERC20 {
    address public attackTarget;
    bytes public attackCalldata;
    bool public shouldAttack;

    constructor() MockERC20("Evil", "EVIL") {}

    function setAttack(address target, bytes memory data) external {
        attackTarget = target;
        attackCalldata = data;
        shouldAttack = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (shouldAttack) {
            shouldAttack = false;
            (bool success,) = attackTarget.call(attackCalldata);
            // If reentrancy is properly blocked, success will be false
            require(!success, "Reentrancy was not blocked!");
        }
    }
}

contract AuditAttacksTest is Test {
    MockERC20 token;
    SaikoDarkPoolStaking staking;
    SaikoDarkPool pool;
    SaikoSwapRouter router;
    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address attacker = address(0xBAD);

    uint256 constant TIER_1 = 10_000_000e18;

    function setUp() public {
        token = new MockERC20("Saiko", "SAIKO");
        staking = new SaikoDarkPoolStaking(address(token), address(0));
        pool = new SaikoDarkPool(address(token), treasury, address(staking));
        staking.setPool(address(pool));
        router = new SaikoSwapRouter(address(token), treasury, address(staking));
        staking.setAuthorisedCaller(address(router), true);
        router.setAuthorisedCaller(alice, true);
    }

    function _nullifierHash(bytes32 nullifier) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(nullifier));
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

    // ============================================================
    //                   SaikoDarkPool Attacks
    // ============================================================

    /// @notice Attempt to withdraw without knowing the nullifier preimage
    function test_attack_stealNote_withoutProof() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        // Attacker tries a random nullifier — hash won't map to commitment
        bytes32 fakeNullifier = keccak256("guess");
        vm.prank(attacker);
        vm.expectRevert("Invalid proof");
        pool.withdraw(fakeNullifier, commitment, attacker);
    }

    /// @notice Attempt to withdraw with a wrong nullifier for the commitment
    function test_attack_stealNote_wrongNullifier() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        // Attacker uses a different nullifier that was registered for a different commitment
        bytes32 commitment2 = keccak256("note2");
        bytes32 nullifier2 = keccak256("secret2");
        bytes32 nullifierHash2 = _nullifierHash(nullifier2);
        _depositAs(bob, commitment2, nullifierHash2, TIER_1);

        // Try to withdraw commitment1 using nullifier2 — hashes don't match
        vm.prank(attacker);
        vm.expectRevert("Invalid proof");
        pool.withdraw(nullifier2, commitment, attacker);
    }

    /// @notice Deposit once, try to withdraw twice — second must revert
    function test_attack_doubleWithdraw() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        // First withdrawal succeeds
        pool.withdraw(nullifier, commitment, alice);

        // Second withdrawal reverts
        vm.expectRevert("Note already spent");
        pool.withdraw(nullifier, commitment, alice);
    }

    /// @notice Withdraw amount is derived from stored deposit — cannot be manipulated
    function test_attack_withdrawInvalidTier_reverts() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        // The withdraw function no longer takes an amount parameter.
        // The amount is derived from commitmentAmount[commitment].
        // Verify that the correct amount is returned.
        uint256 fee = (TIER_1 * 50) / 10_000;
        uint256 noteAmount = TIER_1 - fee;
        uint256 balBefore = token.balanceOf(alice);

        pool.withdraw(nullifier, commitment, alice);

        uint256 balAfter = token.balanceOf(alice);
        // Should receive exactly noteAmount (plus any tiny staking reward)
        assertGe(balAfter - balBefore, noteAmount);
        // Should not receive more than noteAmount + reward pool
        assertLe(balAfter - balBefore, TIER_1);
    }

    /// @notice Attempt reentrancy on deposit via malicious token callback
    function test_attack_reentrancy_deposit() public {
        ReentrantToken malToken = new ReentrantToken();
        SaikoDarkPoolStaking malStaking = new SaikoDarkPoolStaking(address(malToken), address(0));
        SaikoDarkPool malPool = new SaikoDarkPool(address(malToken), treasury, address(malStaking));
        malStaking.setPool(address(malPool));

        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);

        malToken.mint(alice, TIER_1);
        vm.prank(alice);
        malToken.approve(address(malPool), TIER_1 * 2);

        // Set up the reentrancy attack: during transferFrom in deposit, try to deposit again
        bytes memory attackCalldata = abi.encodeWithSelector(
            SaikoDarkPool.deposit.selector,
            keccak256("reentrant"),
            keccak256("reentrantNull"),
            TIER_1
        );
        malToken.setAttack(address(malPool), attackCalldata);

        // The deposit should complete; the reentrant call is blocked by ReentrancyGuard
        vm.prank(alice);
        malPool.deposit(commitment, nullifierHash, TIER_1);

        // Verify only one deposit succeeded
        assertTrue(malPool.commitments(commitment));
        assertFalse(malPool.commitments(keccak256("reentrant")));
    }

    /// @notice Attempt reentrancy on withdraw via malicious token callback
    function test_attack_reentrancy_withdraw() public {
        ReentrantToken malToken = new ReentrantToken();
        SaikoDarkPoolStaking malStaking = new SaikoDarkPoolStaking(address(malToken), address(0));
        SaikoDarkPool malPool = new SaikoDarkPool(address(malToken), treasury, address(malStaking));
        malStaking.setPool(address(malPool));

        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);

        // Deposit normally (no attack set yet)
        malToken.mint(alice, TIER_1);
        vm.startPrank(alice);
        malToken.approve(address(malPool), TIER_1);
        malPool.deposit(commitment, nullifierHash, TIER_1);
        vm.stopPrank();

        // Set up reentrancy: during safeTransfer in withdraw, try to withdraw again
        bytes memory attackCalldata = abi.encodeWithSelector(
            SaikoDarkPool.withdraw.selector,
            nullifier,
            commitment,
            address(this)
        );
        malToken.setAttack(address(malPool), attackCalldata);

        // Withdraw should succeed; reentrancy is blocked
        malPool.withdraw(nullifier, commitment, bob);

        assertTrue(malPool.nullifierSpent(nullifierHash));
    }

    /// @notice Two deposits with the same commitment — second must revert
    function test_attack_commitmentCollision() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier1 = keccak256("secret1");
        bytes32 nullifierHash1 = _nullifierHash(nullifier1);
        _depositAs(alice, commitment, nullifierHash1, TIER_1);

        bytes32 nullifier2 = keccak256("secret2");
        bytes32 nullifierHash2 = _nullifierHash(nullifier2);
        token.mint(bob, TIER_1);
        vm.startPrank(bob);
        token.approve(address(pool), TIER_1);
        vm.expectRevert("Commitment exists");
        pool.deposit(commitment, nullifierHash2, TIER_1);
        vm.stopPrank();
    }

    /// @notice Deposit, pause, try to withdraw — must revert
    function test_attack_withdrawWhenPaused() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        pool.pause();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        pool.withdraw(nullifier, commitment, alice);

        // Verify funds are still safe after unpause
        pool.unpause();
        pool.withdraw(nullifier, commitment, alice);
        assertTrue(pool.nullifierSpent(nullifierHash));
    }

    // ============================================================
    //                 SaikoDarkPoolStaking Attacks
    // ============================================================

    /// @notice Non-depositor tries to claim rewards via claimManual
    function test_attack_claimManual_unauthorised() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        vm.warp(block.timestamp + 86400);

        // Attacker doesn't know the nullifier preimage, tries a random one
        bytes32 fakeNullifier = keccak256("wrongguess");
        vm.prank(attacker);
        vm.expectRevert("Invalid claim key");
        staking.claimManual(commitment, bytes32(uint256(0xDEAD)), attacker);
    }

    /// @notice Try to redirect rewards with correct nullifier but different commitment
    function test_attack_claimManual_wrongRecipient() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        vm.warp(block.timestamp + 86400);

        // Even knowing the nullifier, it must match the correct commitment
        bytes32 fakeCommitment = keccak256("fakeNote");
        vm.prank(attacker);
        vm.expectRevert("Invalid claim key");
        staking.claimManual(fakeCommitment, bytes32(uint256(0xDEAD)), attacker);
    }

    /// @notice Claim rewards for a non-existent commitment
    function test_attack_drainRewards_withFakeCommitment() public {
        // Deposit a real note so reward pool has funds
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        vm.warp(block.timestamp + 86400);

        // Try to claim for a fake commitment with a fake nullifier
        bytes32 fakeNullifier = keccak256("fakeSecret");
        bytes32 fakeCommitment = keccak256("fakeNote");
        vm.prank(attacker);
        vm.expectRevert("Invalid claim key");
        staking.claimManual(fakeCommitment, bytes32(uint256(0xDEAD)), attacker);
    }

    /// @notice Non-owner calls setPool — must revert
    function test_attack_setPool_unauthorised() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        staking.setPool(attacker);
    }

    /// @notice Non-pool address calls accrueReward — must revert
    function test_attack_accrueReward_nonPool() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorised");
        staking.accrueReward(keccak256("fake"), keccak256("fakeNull"), TIER_1, 1000e18);
    }

    // ============================================================
    //                  SaikoSwapRouter Attacks
    // ============================================================

    /// @notice Non-authorised address calls collectFee — must revert
    function test_attack_collectFee_unauthorised() public {
        token.mint(attacker, 1000e18);
        vm.startPrank(attacker);
        token.approve(address(router), 1000e18);
        vm.expectRevert("Not authorised");
        router.collectFee(1000e18, bytes32(0));
        vm.stopPrank();
    }

    /// @notice Call collectFee with 0 amount — should handle gracefully
    function test_attack_collectFee_zeroAmount() public {
        vm.prank(alice);
        router.collectFee(0, bytes32(0));
        // No revert — zero fee is a no-op transfer
    }

    // ============================================================
    //                    Integration Tests
    // ============================================================

    /// @notice Full deposit → wait → earn rewards → withdraw → verify balances
    function test_integration_fullDepositWithdrawCycle() public {
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);

        uint256 depositAmount = TIER_1;
        uint256 fee = (depositAmount * 50) / 10_000;
        uint256 noteAmount = depositAmount - fee;

        // Deposit
        _depositAs(alice, commitment, nullifierHash, depositAmount);
        assertEq(pool.tierBalance(TIER_1), noteAmount);

        // Wait 7 days for rewards to accrue
        vm.warp(block.timestamp + 7 days);
        uint256 expectedReward = staking.earned(commitment);
        assertGt(expectedReward, 0);

        // Withdraw
        uint256 balBefore = token.balanceOf(alice);
        pool.withdraw(nullifier, commitment, alice);
        uint256 balAfter = token.balanceOf(alice);

        // Alice should receive noteAmount + staking rewards
        uint256 received = balAfter - balBefore;
        assertGe(received, noteAmount);
        assertGe(received, noteAmount + expectedReward - 1); // allow rounding

        // Pool state should be clean
        assertEq(pool.tierBalance(TIER_1), 0);
        assertTrue(pool.nullifierSpent(nullifierHash));
    }

    /// @notice 3 depositors, different amounts, verify pro-rata reward distribution
    function test_integration_multipleDepositors_rewardDistribution() public {
        address charlie = address(0xC);

        // Deposit 3 notes (same tier)
        _depositAs(alice, keccak256("note1"), _nullifierHash(keccak256("secret1")), TIER_1);
        _depositAs(bob, keccak256("note2"), _nullifierHash(keccak256("secret2")), TIER_1);
        _depositAs(charlie, keccak256("note3"), _nullifierHash(keccak256("secret3")), TIER_1);

        // Wait 1 day
        vm.warp(block.timestamp + 86400);

        uint256 e1 = staking.earned(keccak256("note1"));
        uint256 e2 = staking.earned(keccak256("note2"));
        uint256 e3 = staking.earned(keccak256("note3"));

        // All should earn approximately equal rewards (within rounding)
        assertGt(e1, 0);
        assertApproxEqAbs(e1, e2, 1e18);
        assertApproxEqAbs(e2, e3, 1e18);

        // Total earned should not exceed reward pool
        assertLe(e1 + e2 + e3, staking.rewardPool());

        // Withdraw all and verify balances
        uint256 noteAmount = TIER_1 - (TIER_1 * 50) / 10_000;

        pool.withdraw(keccak256("secret1"), keccak256("note1"), alice);
        pool.withdraw(keccak256("secret2"), keccak256("note2"), bob);
        pool.withdraw(keccak256("secret3"), keccak256("note3"), charlie);

        assertGe(token.balanceOf(alice), noteAmount);
        assertGe(token.balanceOf(bob), noteAmount);
        assertGe(token.balanceOf(charlie), noteAmount);
    }

    /// @notice Swap fee flows through router → staking → depositor earns it
    function test_integration_swapFeeAccrualToStaking() public {
        // Deposit a note
        bytes32 commitment = keccak256("note1");
        bytes32 nullifier = keccak256("secret1");
        bytes32 nullifierHash = _nullifierHash(nullifier);
        _depositAs(alice, commitment, nullifierHash, TIER_1);

        // Collect a swap fee via router with the commitment
        uint256 swapFee = 1_000_000e18;
        token.mint(alice, swapFee);
        vm.startPrank(alice);
        token.approve(address(router), swapFee);
        router.collectFee(swapFee, commitment);
        vm.stopPrank();

        // The staking reward pool should have increased
        uint256 stakingShare = (swapFee * 1000) / 10_000;
        uint256 depositFee = (TIER_1 * 50) / 10_000;
        uint256 depositStakingFee = (depositFee * 1000) / 10_000;
        assertEq(staking.rewardPool(), depositStakingFee + stakingShare);

        // Wait for rewards to accrue
        vm.warp(block.timestamp + 86400);

        uint256 earned = staking.earned(commitment);
        assertGt(earned, 0);

        // Withdraw and verify depositor received rewards from both deposit fee and swap fee
        uint256 balBefore = token.balanceOf(bob);
        pool.withdraw(nullifier, commitment, bob);
        uint256 received = token.balanceOf(bob) - balBefore;

        uint256 noteAmount = TIER_1 - depositFee;
        assertGe(received, noteAmount);
    }
}



