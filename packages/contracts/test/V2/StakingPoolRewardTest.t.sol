// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoDarkPoolStaking.sol";
import "../mocks/MockERC20.sol";

/// @notice Tests for SaikoDarkPoolStaking.injectPoolReward — per-pool bonus distribution
contract StakingPoolRewardTest is Test {
    MockERC20 saiko;
    SaikoDarkPoolStaking staking;

    address owner = address(this);
    address poolA  = address(0xA000);
    address poolB  = address(0xB000);
    address alice  = address(0xA11CE);
    address bob    = address(0xB0B);

    bytes32 constant COMMIT_A1   = keccak256("alice-note-pool-a");
    bytes32 constant COMMIT_A2   = keccak256("alice-note-pool-a-2");
    bytes32 constant COMMIT_B1   = keccak256("bob-note-pool-b");

    // claimManual auth: preimage is what you pass to claimManual,
    // hash (keccak256 of preimage) is what accrueReward stores as "depositor"
    bytes32 constant PREIMAGE_A1 = bytes32(uint256(0xA1A1A1));
    bytes32 constant PREIMAGE_A2 = bytes32(uint256(0xA2A2A2));
    bytes32 constant PREIMAGE_B1 = bytes32(uint256(0xB1B1B1));

    uint256 constant STAKE     = 10_000_000e18;
    uint256 constant FEE       = 100e18;

    function setUp() public {
        saiko = new MockERC20("Saiko", "SAIKO");
        staking = new SaikoDarkPoolStaking(address(saiko), address(0));

        // Authorise both pools
        staking.setAuthorisedCaller(poolA, true);
        staking.setAuthorisedCaller(poolB, true);

        // Mint SAIKO to pools and owner/treasury (for fee payments and injections)
        saiko.mint(poolA,  1_000_000e18);
        saiko.mint(poolB,  1_000_000e18);
        saiko.mint(owner,  1_000_000e18);

        // Set treasury to owner so tests can call injectPoolReward
        staking.setTreasury(owner);

        // Pre-fund the bonus pool (one-time approval + deposit)
        saiko.approve(address(staking), type(uint256).max);
        staking.fundBonusPool(500_000e18);

        // Alice deposits into poolA (depositor = keccak of preimage, per claimManual auth scheme)
        vm.startPrank(poolA);
        saiko.approve(address(staking), FEE);
        staking.accrueReward(COMMIT_A1, keccak256(abi.encodePacked(PREIMAGE_A1)), STAKE, FEE);
        vm.stopPrank();

        // Bob deposits into poolB
        vm.startPrank(poolB);
        saiko.approve(address(staking), FEE);
        staking.accrueReward(COMMIT_B1, keccak256(abi.encodePacked(PREIMAGE_B1)), STAKE, FEE);
        vm.stopPrank();
    }

    // ── injectPoolReward: basic distribution ──────────────────────────────

    function test_inject_credited_to_correct_pool() public {
        uint256 bonus = 500e18;
        staking.injectPoolReward(poolA, bonus);

        // Alice (poolA staker) should have earned the full bonus
        assertEq(staking.earnedPoolBonus(COMMIT_A1), bonus);

        // Bob (poolB staker) earns nothing
        assertEq(staking.earnedPoolBonus(COMMIT_B1), 0);
    }

    function test_inject_splits_proportionally_between_two_notes() public {
        // Add a second note of the same size into poolA
        vm.startPrank(poolA);
        saiko.approve(address(staking), FEE);
        staking.accrueReward(COMMIT_A2, keccak256(abi.encodePacked(PREIMAGE_A2)), STAKE, FEE);
        vm.stopPrank();

        uint256 bonus = 1_000e18;
        staking.injectPoolReward(poolA, bonus);

        // Two equal stakes — each gets half
        assertEq(staking.earnedPoolBonus(COMMIT_A1), bonus / 2);
        assertEq(staking.earnedPoolBonus(COMMIT_A2), bonus / 2);
    }

    function test_inject_multiple_rounds_accumulate() public {
        uint256 bonus1 = 300e18;
        uint256 bonus2 = 700e18;
        saiko.approve(address(staking), bonus1 + bonus2);

        staking.injectPoolReward(poolA, bonus1);
        staking.injectPoolReward(poolA, bonus2);

        assertEq(staking.earnedPoolBonus(COMMIT_A1), bonus1 + bonus2);
    }

    // ── injectPoolReward: late depositor doesn't earn past bonuses ────────

    function test_late_depositor_misses_prior_injection() public {
        // Inject bonus BEFORE second note is created
        uint256 bonus = 1_000e18;
        staking.injectPoolReward(poolA, bonus);

        // Now a second note deposits into poolA
        vm.startPrank(poolA);
        saiko.approve(address(staking), FEE);
        staking.accrueReward(COMMIT_A2, keccak256(abi.encodePacked(PREIMAGE_A2)), STAKE, FEE);
        vm.stopPrank();

        // First note earns the full prior bonus
        assertEq(staking.earnedPoolBonus(COMMIT_A1), bonus);
        // Second note earns nothing from prior injection
        assertEq(staking.earnedPoolBonus(COMMIT_A2), 0);

        // Inject again — now both share equally
        uint256 bonus2 = 500e18;
        staking.injectPoolReward(poolA, bonus2);

        assertEq(staking.earnedPoolBonus(COMMIT_A1), bonus + bonus2 / 2);
        assertEq(staking.earnedPoolBonus(COMMIT_A2), bonus2 / 2);
    }

    // ── injectPoolReward: bonus paid out on claimReward ───────────────────

    function test_bonus_paid_on_claimReward() public {
        uint256 bonus = 500e18;
        staking.injectPoolReward(poolA, bonus);

        // Set poolA as the authorised "pool" (for onlyPool claimReward gate)
        staking.setPool(poolA);
        // Re-authorise poolB (setPool de-authorises old pool which was address(0))
        staking.setAuthorisedCaller(poolB, true);

        uint256 balBefore = saiko.balanceOf(alice);
        vm.prank(poolA);
        staking.claimReward(COMMIT_A1, alice);
        uint256 balAfter = saiko.balanceOf(alice);

        // Alice receives global drip rewards (may be ~0 since no time elapsed) + bonus
        assertTrue(balAfter - balBefore >= bonus, "Alice should receive at least the bonus");
        // Bonus fully paid out, earnedPoolBonus now 0
        assertEq(staking.earnedPoolBonus(COMMIT_A1), 0);
        assertEq(staking.totalPoolBonusReserve(), 0);
    }

    // ── injectPoolReward: bonus paid on claimManual ───────────────────────

    function test_bonus_paid_on_claimManual() public {
        uint256 bonus = 400e18;
        staking.injectPoolReward(poolA, bonus);

        uint256 balBefore = saiko.balanceOf(alice);
        // claimManual uses the preimage (hash of it was stored at deposit)
        staking.claimManual(COMMIT_A1, PREIMAGE_A1, alice);
        uint256 balAfter = saiko.balanceOf(alice);

        assertTrue(balAfter - balBefore >= bonus);
        assertEq(staking.earnedPoolBonus(COMMIT_A1), 0);
    }

    // ── injectPoolReward: bonus forfeited to rewardPool on deactivate ─────

    function test_forfeit_on_deactivate_goes_to_rewardPool() public {
        uint256 bonus = 600e18;
        staking.injectPoolReward(poolA, bonus);

        uint256 rewardPoolBefore = staking.rewardPool();

        staking.setPool(poolA);
        vm.prank(poolA);
        staking.deactivateNote(COMMIT_A1);

        // Forfeited bonus re-routed to global rewardPool
        assertEq(staking.rewardPool(), rewardPoolBefore + bonus);
        assertEq(staking.totalPoolBonusReserve(), 0);
        assertEq(staking.earnedPoolBonus(COMMIT_A1), 0);
    }

    // ── injectPoolReward: reverts ─────────────────────────────────────────

    function test_revert_inject_zero_amount() public {
        vm.expectRevert("Zero amount");
        staking.injectPoolReward(poolA, 0);
    }

    function test_revert_inject_zero_pool() public {
        saiko.approve(address(staking), 100e18);
        vm.expectRevert("Zero pool");
        staking.injectPoolReward(address(0), 100e18);
    }

    function test_revert_inject_no_stakers() public {
        address emptyPool = address(0xDEAD);
        saiko.approve(address(staking), 100e18);
        vm.expectRevert("No active stakers in pool");
        staking.injectPoolReward(emptyPool, 100e18);
    }

    function test_revert_inject_not_treasury() public {
        // alice is not the treasury — should revert
        saiko.mint(alice, 100e18);
        vm.startPrank(alice);
        saiko.approve(address(staking), 100e18);
        vm.expectRevert("Only treasury");
        staking.injectPoolReward(poolA, 100e18);
        vm.stopPrank();
    }

    function test_revert_inject_treasury_not_set() public {
        // Deploy a fresh staking with no treasury set
        SaikoDarkPoolStaking fresh = new SaikoDarkPoolStaking(address(saiko), address(0));
        fresh.setAuthorisedCaller(poolA, true);
        // Fund and register a note
        vm.startPrank(poolA);
        saiko.approve(address(fresh), FEE);
        fresh.accrueReward(COMMIT_A1, keccak256(abi.encodePacked(PREIMAGE_A1)), STAKE, FEE);
        vm.stopPrank();
        // Even owner can't inject if treasury not set
        saiko.approve(address(fresh), 100e18);
        vm.expectRevert("Only treasury");
        fresh.injectPoolReward(poolA, 100e18);
    }

    // ── poolBonusTotalStaked decrements on claim ──────────────────────────

    function test_poolBonusTotalStaked_decrements_on_claim() public {
        assertEq(staking.poolBonusTotalStaked(poolA), STAKE);

        staking.setPool(poolA);
        vm.prank(poolA);
        staking.claimReward(COMMIT_A1, alice);

        assertEq(staking.poolBonusTotalStaked(poolA), 0);
    }

    // ── event emitted ─────────────────────────────────────────────────────

    function test_inject_emits_event() public {
        uint256 bonus = 200e18;
        saiko.approve(address(staking), bonus);
        vm.expectEmit(true, false, false, true);
        emit SaikoDarkPoolStaking.PoolRewardInjected(poolA, bonus, STAKE);
        staking.injectPoolReward(poolA, bonus);
    }
}
