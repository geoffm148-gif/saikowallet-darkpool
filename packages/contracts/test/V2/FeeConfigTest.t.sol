// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoFeeConfig.sol";

contract FeeConfigTest is Test {
    SaikoFeeConfig config;
    address payable constant TREASURY = payable(address(0xCAFE));
    address alice = address(0xA11CE);

    function setUp() public {
        config = new SaikoFeeConfig(TREASURY);
    }

    // ── Default values ─────────────────────────────────────────────────────

    function test_defaultValues() public view {
        assertEq(config.swapFeeBPS(), 50);
        assertEq(config.darkpoolFeeBPS(), 50);
        assertEq(config.customPoolDefaultFeeBPS(), 100);
        assertEq(config.saikoCustomCutBPS(), 5000);
        assertEq(config.providerShareBPS(), 1000);
        assertEq(config.treasury(), TREASURY);
    }

    // ── Owner can set each fee ─────────────────────────────────────────────

    function test_setSwapFee() public {
        config.setSwapFee(75);
        assertEq(config.swapFeeBPS(), 75);
    }

    function test_setSwapFee_zero() public {
        config.setSwapFee(0);
        assertEq(config.swapFeeBPS(), 0);
    }

    function test_setSwapFee_max() public {
        config.setSwapFee(100);
        assertEq(config.swapFeeBPS(), 100);
    }

    function test_setDarkPoolFee() public {
        config.setDarkPoolFee(100);
        assertEq(config.darkpoolFeeBPS(), 100);
    }

    function test_setDarkPoolFee_max() public {
        config.setDarkPoolFee(150);
        assertEq(config.darkpoolFeeBPS(), 150);
    }

    function test_setCustomPoolDefaultFee() public {
        config.setCustomPoolDefaultFee(150);
        assertEq(config.customPoolDefaultFeeBPS(), 150);
    }

    function test_setCustomPoolDefaultFee_max() public {
        config.setCustomPoolDefaultFee(200);
        assertEq(config.customPoolDefaultFeeBPS(), 200);
    }

    // saikoCustomCut: 0%–100% (0–10000)
    function test_setSaikoCustomCut_zero() public {
        config.setSaikoCustomCut(0);
        assertEq(config.saikoCustomCutBPS(), 0);
    }

    function test_setSaikoCustomCut_fifty() public {
        config.setSaikoCustomCut(5000);
        assertEq(config.saikoCustomCutBPS(), 5000);
    }

    function test_setSaikoCustomCut_max() public {
        config.setSaikoCustomCut(7000);
        assertEq(config.saikoCustomCutBPS(), 7000);
    }

    // providerShare: 0%–100% (0–10000)
    function test_setProviderShare_zero() public {
        config.setProviderShare(0);
        assertEq(config.providerShareBPS(), 0);
    }

    function test_setProviderShare_thirty() public {
        config.setProviderShare(3000);
        assertEq(config.providerShareBPS(), 3000);
    }

    function test_setProviderShare_max() public {
        config.setProviderShare(10000);
        assertEq(config.providerShareBPS(), 10000);
    }

    // ── Treasury update ────────────────────────────────────────────────────

    function test_setTreasury() public {
        address payable newTreasury = payable(address(0xBEEF));
        config.setTreasury(newTreasury);
        assertEq(config.treasury(), newTreasury);
    }

    function test_revert_setTreasury_zero() public {
        vm.expectRevert("Zero treasury");
        config.setTreasury(payable(address(0)));
    }

    function test_revert_setTreasury_nonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        config.setTreasury(payable(address(0xBEEF)));
    }

    function test_event_treasuryUpdated() public {
        address payable newTreasury = payable(address(0xBEEF));
        vm.expectEmit(true, true, false, false);
        emit SaikoFeeConfig.TreasuryUpdated(TREASURY, newTreasury);
        config.setTreasury(newTreasury);
    }

    // ── Reverts above hardcoded caps ───────────────────────────────────────

    function test_revert_swapFeeExceedsMax() public {
        vm.expectRevert("Exceeds max swap fee");
        config.setSwapFee(101);
    }

    function test_revert_darkpoolFeeExceedsMax() public {
        vm.expectRevert("Exceeds max darkpool fee");
        config.setDarkPoolFee(151);
    }

    function test_revert_customPoolFeeExceedsMax() public {
        vm.expectRevert("Exceeds max custom pool fee");
        config.setCustomPoolDefaultFee(201);
    }

    function test_revert_saikoCustomCutExceeds100Percent() public {
        vm.expectRevert("max 70%");
        config.setSaikoCustomCut(7001);
    }

    function test_revert_providerShareExceeds100Percent() public {
        vm.expectRevert("Exceeds 100%");
        config.setProviderShare(10001);
    }

    // ── Non-owner reverts ──────────────────────────────────────────────────

    function test_revert_nonOwner_setSwapFee() public {
        vm.prank(alice); vm.expectRevert(); config.setSwapFee(50);
    }

    function test_revert_nonOwner_setDarkPoolFee() public {
        vm.prank(alice); vm.expectRevert(); config.setDarkPoolFee(50);
    }

    function test_revert_nonOwner_setCustomPoolDefaultFee() public {
        vm.prank(alice); vm.expectRevert(); config.setCustomPoolDefaultFee(50);
    }

    function test_revert_nonOwner_setSaikoCustomCut() public {
        vm.prank(alice); vm.expectRevert(); config.setSaikoCustomCut(3000);
    }

    function test_revert_nonOwner_setProviderShare() public {
        vm.prank(alice); vm.expectRevert(); config.setProviderShare(2000);
    }

    // ── Events ─────────────────────────────────────────────────────────────

    function test_event_swapFeeUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit SaikoFeeConfig.SwapFeeUpdated(50, 75);
        config.setSwapFee(75);
    }

    function test_event_darkPoolFeeUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit SaikoFeeConfig.DarkPoolFeeUpdated(50, 100);
        config.setDarkPoolFee(100);
    }

    function test_event_customPoolDefaultFeeUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit SaikoFeeConfig.CustomPoolDefaultFeeUpdated(100, 150);
        config.setCustomPoolDefaultFee(150);
    }

    function test_event_saikoCustomCutUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit SaikoFeeConfig.SaikoCustomCutUpdated(5000, 3000);
        config.setSaikoCustomCut(3000);
    }

    function test_event_providerShareUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit SaikoFeeConfig.ProviderShareUpdated(1000, 2000);
        config.setProviderShare(2000);
    }

    // ── Math edge cases ────────────────────────────────────────────────────

    function test_providerShare_zero_allToTreasury() public {
        config.setProviderShare(0);
        uint256 revenue = 1 ether;
        uint256 providerAmount = (revenue * config.providerShareBPS()) / config.BPS_DENOMINATOR();
        assertEq(providerAmount, 0);
        assertEq(revenue - providerAmount, revenue);
    }

    function test_providerShare_10000_allToProviders() public {
        config.setProviderShare(10000);
        uint256 revenue = 1 ether;
        uint256 providerAmount = (revenue * config.providerShareBPS()) / config.BPS_DENOMINATOR();
        assertEq(providerAmount, revenue);
    }

    function test_saikoCustomCut_7000_maxToSaiko() public {
        config.setSaikoCustomCut(7000);
        uint256 poolFee = 1 ether;
        uint256 saikoFee = (poolFee * config.saikoCustomCutBPS()) / config.BPS_DENOMINATOR();
        assertEq(saikoFee, 0.7 ether);
    }

    function test_saikoCustomCut_zero_allToLP() public {
        config.setSaikoCustomCut(0);
        uint256 poolFee = 1 ether;
        uint256 saikoFee = (poolFee * config.saikoCustomCutBPS()) / config.BPS_DENOMINATOR();
        assertEq(saikoFee, 0);
    }
}
