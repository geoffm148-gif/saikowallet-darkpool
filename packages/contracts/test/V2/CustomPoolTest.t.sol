// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoCustomPool.sol";
import "../../src/SaikoFeeConfig.sol";
import "../../src/SaikoDarkPoolStaking.sol";
import "../../src/SaikoPoolFactory.sol";
import "../mocks/MockERC20.sol";

contract CustomPoolTest is Test {
    MockERC20 tokenA;
    MockERC20 tokenB;
    SaikoFeeConfig feeConfig;
    SaikoDarkPoolStaking staking;
    SaikoPoolFactory factory;
    SaikoCustomPool pool;
    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant AMOUNT_A = 100_000e18;
    uint256 constant AMOUNT_B = 200_000e18;

    function setUp() public {
        tokenA = new MockERC20("TokenA", "TKA");
        tokenB = new MockERC20("TokenB", "TKB");
        feeConfig = new SaikoFeeConfig(payable(address(0xBEEF))); // defaults: 1% pool fee, 50% saiko cut, 10% provider share
        staking = new SaikoDarkPoolStaking(address(tokenA), address(0));
        factory = new SaikoPoolFactory(address(feeConfig), address(staking));
        staking.setPoolFactory(address(factory));

        // Authorise factory-created pools' staking calls
        staking.setAuthorisedCaller(address(this), true);

        // Create pool via factory (auto-authorises pool in staking via authorizePool)
        address poolAddr = factory.createPool(address(tokenA), address(tokenB), 100); // 1%
        pool = SaikoCustomPool(poolAddr);

        // Authorise pool in staking
        staking.setAuthorisedCaller(poolAddr, true);
    }

    function _sortedTokenA() internal view returns (address) {
        return address(tokenA) < address(tokenB) ? address(tokenA) : address(tokenB);
    }

    function _sortedTokenB() internal view returns (address) {
        return address(tokenA) < address(tokenB) ? address(tokenB) : address(tokenA);
    }

    function _addInitialLiquidity(uint256 amtA, uint256 amtB) internal {
        // Amounts correspond to sorted token order
        MockERC20 sortedA = MockERC20(_sortedTokenA());
        MockERC20 sortedB = MockERC20(_sortedTokenB());

        sortedA.mint(alice, amtA);
        sortedB.mint(alice, amtB);
        vm.startPrank(alice);
        sortedA.approve(address(pool), amtA);
        sortedB.approve(address(pool), amtB);
        pool.addLiquidity(amtA, amtB, 0, type(uint256).max);
        vm.stopPrank();
    }

    // ── addLiquidity mints correct shares (first and subsequent) ──────────

    function test_addLiquidity_first() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);

        uint256 expectedShares = _sqrt(AMOUNT_A * AMOUNT_B) - 1000; // minus MINIMUM_LIQUIDITY
        assertEq(pool.balanceOf(alice), expectedShares);
        assertEq(pool.reserveA(), AMOUNT_A);
        assertEq(pool.reserveB(), AMOUNT_B);
    }

    function test_addLiquidity_subsequent() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);
        uint256 aliceShares = pool.balanceOf(alice);

        // Bob adds proportional liquidity
        MockERC20 sortedA = MockERC20(_sortedTokenA());
        MockERC20 sortedB = MockERC20(_sortedTokenB());
        uint256 addA = AMOUNT_A / 2;
        uint256 addB = AMOUNT_B / 2;
        sortedA.mint(bob, addA);
        sortedB.mint(bob, addB);
        vm.startPrank(bob);
        sortedA.approve(address(pool), addA);
        sortedB.approve(address(pool), addB);
        pool.addLiquidity(addA, addB, 0, type(uint256).max);
        vm.stopPrank();

        // Bob should get ~ half of alice's shares
        uint256 bobShares = pool.balanceOf(bob);
        // shares = min(addA * totalSupply / reserveA, addB * totalSupply / reserveB)
        uint256 totalBefore = aliceShares + 1000; // + MINIMUM_LIQUIDITY
        uint256 expectedBob = (addA * totalBefore) / AMOUNT_A;
        assertEq(bobShares, expectedBob);
    }

    // ── removeLiquidity returns correct tokens ────────────────────────────

    function test_removeLiquidity() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);
        uint256 shares = pool.balanceOf(alice);

        MockERC20 sortedA = MockERC20(_sortedTokenA());
        MockERC20 sortedB = MockERC20(_sortedTokenB());
        uint256 balABefore = sortedA.balanceOf(alice);
        uint256 balBBefore = sortedB.balanceOf(alice);

        vm.prank(alice);
        pool.removeLiquidity(shares, 0, 0, type(uint256).max);

        uint256 returnedA = sortedA.balanceOf(alice) - balABefore;
        uint256 returnedB = sortedB.balanceOf(alice) - balBBefore;

        // Should get back slightly less than deposited due to MINIMUM_LIQUIDITY lock
        assertTrue(returnedA > 0 && returnedA <= AMOUNT_A);
        assertTrue(returnedB > 0 && returnedB <= AMOUNT_B);
        assertEq(pool.balanceOf(alice), 0);
    }

    // ── swap output correct (x*y=k) ──────────────────────────────────────

    function test_swap_correctOutput() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);

        uint256 swapIn = 1_000e18;
        MockERC20 sortedA = MockERC20(_sortedTokenA());
        MockERC20 sortedB = MockERC20(_sortedTokenB());

        sortedA.mint(bob, swapIn);
        uint256 outBefore = sortedB.balanceOf(bob);

        vm.startPrank(bob);
        sortedA.approve(address(pool), swapIn);
        uint256 amountOut = pool.swap(_sortedTokenA(), swapIn, 0, type(uint256).max);
        vm.stopPrank();

        // Verify x*y=k math
        uint256 poolFee = (swapIn * 100) / 10_000; // 1%
        uint256 amountInAfterFee = swapIn - poolFee;
        uint256 expectedOut = (amountInAfterFee * AMOUNT_B) / (AMOUNT_A + amountInAfterFee);

        assertEq(amountOut, expectedOut);
        assertEq(sortedB.balanceOf(bob) - outBefore, amountOut);
    }

    // ── swap fee split: correct treasury, provider, LP amounts ────────────

    function test_swap_feeSplit() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);

        uint256 swapIn = 10_000e18;
        MockERC20 sortedA = MockERC20(_sortedTokenA());

        sortedA.mint(bob, swapIn);
        uint256 treasuryBefore = sortedA.balanceOf(treasury);
        uint256 stakingBefore = sortedA.balanceOf(address(staking));
        uint256 reserveABefore = pool.reserveA();

        vm.startPrank(bob);
        sortedA.approve(address(pool), swapIn);
        pool.swap(_sortedTokenA(), swapIn, 0, type(uint256).max);
        vm.stopPrank();

        // Fee math:
        // poolFee = 10_000e18 * 100 / 10_000 = 100e18
        // saikoFee = 100e18 * 5000 / 10_000 = 50e18 (50% saiko cut)
        // lpFee = 100e18 - 50e18 = 50e18
        // providerShare = 50e18 * 1000 / 10_000 = 5e18 (10% of saiko's cut)
        // treasuryShare = 50e18 - 5e18 = 45e18
        uint256 poolFee = (swapIn * 100) / 10_000;
        uint256 saikoFee = (poolFee * 5000) / 10_000;
        uint256 lpFee = poolFee - saikoFee;
        uint256 providerShare = (saikoFee * 1000) / 10_000;
        uint256 treasuryShare = saikoFee - providerShare;

        assertEq(sortedA.balanceOf(treasury) - treasuryBefore, treasuryShare);
        assertEq(sortedA.balanceOf(address(staking)) - stakingBefore, providerShare);

        // LP fee stays in pool (reflected in reserve increase beyond swap amount)
        uint256 amountInAfterFee = swapIn - poolFee;
        assertEq(pool.reserveA(), reserveABefore + amountInAfterFee + lpFee);
    }

    // ── Fee split changes when providerShare updated in feeConfig ─────────

    function test_swap_feeSplitChangesWithConfig() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);

        // Change provider share to 20%
        feeConfig.setProviderShare(2000);

        uint256 swapIn = 10_000e18;
        MockERC20 sortedA = MockERC20(_sortedTokenA());

        sortedA.mint(bob, swapIn);
        uint256 stakingBefore = sortedA.balanceOf(address(staking));

        vm.startPrank(bob);
        sortedA.approve(address(pool), swapIn);
        pool.swap(_sortedTokenA(), swapIn, 0, type(uint256).max);
        vm.stopPrank();

        uint256 poolFee = (swapIn * 100) / 10_000;
        uint256 saikoFee = (poolFee * 5000) / 10_000;
        uint256 providerShare = (saikoFee * 2000) / 10_000; // 20% now

        assertEq(sortedA.balanceOf(address(staking)) - stakingBefore, providerShare);
    }

    // ── Slippage protection ────────────────────────────────────────────────

    function test_revert_slippageExceeded() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);

        uint256 swapIn = 1_000e18;
        MockERC20 sortedA = MockERC20(_sortedTokenA());
        sortedA.mint(bob, swapIn);

        vm.startPrank(bob);
        sortedA.approve(address(pool), swapIn);
        vm.expectRevert("Slippage exceeded");
        pool.swap(_sortedTokenA(), swapIn, type(uint256).max, type(uint256).max); // impossible min
        vm.stopPrank();
    }

    // ── Cannot swap with zero liquidity ────────────────────────────────────

    function test_revert_swapNoLiquidity() public {
        uint256 swapIn = 1_000e18;
        MockERC20 sortedA = MockERC20(_sortedTokenA());
        sortedA.mint(bob, swapIn);

        vm.startPrank(bob);
        sortedA.approve(address(pool), swapIn);
        vm.expectRevert("No liquidity");
        pool.swap(_sortedTokenA(), swapIn, 0, type(uint256).max);
        vm.stopPrank();
    }

    // ── Both token directions work ─────────────────────────────────────────

    function test_swap_bothDirections() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);

        uint256 swapIn = 1_000e18;
        MockERC20 sortedA = MockERC20(_sortedTokenA());
        MockERC20 sortedB = MockERC20(_sortedTokenB());

        // Direction 1: A → B
        sortedA.mint(bob, swapIn);
        vm.startPrank(bob);
        sortedA.approve(address(pool), swapIn);
        uint256 outB = pool.swap(_sortedTokenA(), swapIn, 0, type(uint256).max);
        vm.stopPrank();
        assertTrue(outB > 0);

        // Direction 2: B → A
        sortedB.mint(bob, swapIn);
        vm.startPrank(bob);
        sortedB.approve(address(pool), swapIn);
        uint256 outA = pool.swap(_sortedTokenB(), swapIn, 0, type(uint256).max);
        vm.stopPrank();
        assertTrue(outA > 0);
    }

    // ── Invalid tokenIn reverts ────────────────────────────────────────────

    function test_revert_invalidTokenIn() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);
        MockERC20 fakeToken = new MockERC20("Fake", "FK");
        fakeToken.mint(bob, 1_000e18);
        vm.startPrank(bob);
        fakeToken.approve(address(pool), 1_000e18);
        vm.expectRevert("Invalid tokenIn");
        pool.swap(address(fakeToken), 1_000e18, 0, type(uint256).max);
        vm.stopPrank();
    }

    // ── Zero amountIn reverts ──────────────────────────────────────────────

    function test_revert_zeroAmountIn() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);
        vm.prank(bob);
        vm.expectRevert("Zero amountIn");
        pool.swap(_sortedTokenA(), 0, 0, type(uint256).max);
    }

    // ── Zero shares reverts on removeLiquidity ─────────────────────────────

    function test_revert_removeZeroShares() public {
        vm.prank(alice);
        vm.expectRevert("Zero shares");
        pool.removeLiquidity(0, 0, 0, type(uint256).max);
    }

    // ── Insufficient shares reverts ────────────────────────────────────────

    function test_revert_insufficientShares() public {
        _addInitialLiquidity(AMOUNT_A, AMOUNT_B);
        vm.prank(bob);
        vm.expectRevert("Insufficient shares");
        pool.removeLiquidity(1, 0, 0, type(uint256).max);
    }

    // ── Helper ─────────────────────────────────────────────────────────────

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

