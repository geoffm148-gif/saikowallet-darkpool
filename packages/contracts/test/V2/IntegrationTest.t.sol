// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoFeeConfig.sol";
import "../../src/SaikoSwapRouterV2.sol";
import "../../src/SaikoDarkPoolStaking.sol";
import "../../src/SaikoPoolFactory.sol";
import "../../src/SaikoCustomPool.sol";
import "../mocks/MockERC20.sol";

contract IntegrationTest is Test {
    MockERC20 saiko;
    MockERC20 weth;
    SaikoFeeConfig feeConfig;
    SaikoDarkPoolStaking staking;
    SaikoSwapRouterV2 router;
    SaikoPoolFactory factory;

    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        saiko = new MockERC20("Saiko", "SAIKO");
        weth = new MockERC20("WETH", "WETH");
        feeConfig = new SaikoFeeConfig(payable(address(0xBEEF)));
        staking = new SaikoDarkPoolStaking(address(saiko), address(0));

        router = new SaikoSwapRouterV2(
            address(feeConfig),
            address(saiko),
            address(staking)
        );
        factory = new SaikoPoolFactory(
            address(feeConfig),
            address(staking)
        );
        staking.setPoolFactory(address(factory));

        staking.setAuthorisedCaller(address(router), true);
        router.setAuthorisedCaller(alice, true);
    }

    // ── Full flow: deploy, create pool, add liquidity, swap, check splits ──

    function test_fullFlow() public {
        // Create a SAIKO/WETH pool at 1% fee
        address poolAddr = factory.createPool(address(saiko), address(weth), 100);
        SaikoCustomPool pool = SaikoCustomPool(poolAddr);
        staking.setAuthorisedCaller(poolAddr, true);

        // Determine sorted order
        (address sorted0, address sorted1) = address(saiko) < address(weth)
            ? (address(saiko), address(weth))
            : (address(weth), address(saiko));
        MockERC20 token0 = MockERC20(sorted0);
        MockERC20 token1 = MockERC20(sorted1);

        // Alice adds liquidity
        uint256 liq0 = 100_000e18;
        uint256 liq1 = 50_000e18;
        token0.mint(alice, liq0);
        token1.mint(alice, liq1);
        vm.startPrank(alice);
        token0.approve(poolAddr, liq0);
        token1.approve(poolAddr, liq1);
        pool.addLiquidity(liq0, liq1, 0, type(uint256).max);
        vm.stopPrank();

        assertTrue(pool.balanceOf(alice) > 0);
        assertEq(pool.reserveA(), liq0);
        assertEq(pool.reserveB(), liq1);

        // Bob swaps 1000 token0 for token1
        uint256 swapIn = 1_000e18;
        token0.mint(bob, swapIn);

        uint256 treasuryBefore = token0.balanceOf(treasury);
        uint256 stakingBefore = token0.balanceOf(address(staking));

        vm.startPrank(bob);
        token0.approve(poolAddr, swapIn);
        uint256 amountOut = pool.swap(sorted0, swapIn, 0, type(uint256).max);
        vm.stopPrank();

        assertTrue(amountOut > 0);

        // Verify fee split:
        // poolFee = 1000e18 * 100 / 10000 = 10e18
        // saikoFee = 10e18 * 5000 / 10000 = 5e18
        // lpFee = 5e18
        // providerShare = 5e18 * 1000 / 10000 = 0.5e18
        // treasuryShare = 5e18 - 0.5e18 = 4.5e18
        uint256 poolFee = (swapIn * 100) / 10_000;
        uint256 saikoFee = (poolFee * 5000) / 10_000;
        uint256 providerShare = (saikoFee * 1000) / 10_000;
        uint256 treasuryShare = saikoFee - providerShare;

        assertEq(token0.balanceOf(treasury) - treasuryBefore, treasuryShare);
        assertEq(token0.balanceOf(address(staking)) - stakingBefore, providerShare);
    }

    // ── Change providerShare 10% → 20%, swap, verify new split ─────────────

    function test_providerShareChangeReflects() public {
        address poolAddr = factory.createPool(address(saiko), address(weth), 100);
        SaikoCustomPool pool = SaikoCustomPool(poolAddr);
        staking.setAuthorisedCaller(poolAddr, true);

        (address sorted0,) = address(saiko) < address(weth)
            ? (address(saiko), address(weth))
            : (address(weth), address(saiko));
        MockERC20 token0 = MockERC20(sorted0);
        MockERC20 token1 = MockERC20(sorted0 == address(saiko) ? address(weth) : address(saiko));

        // Add liquidity
        token0.mint(alice, 100_000e18);
        token1.mint(alice, 100_000e18);
        vm.startPrank(alice);
        token0.approve(poolAddr, 100_000e18);
        token1.approve(poolAddr, 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18, 0, type(uint256).max);
        vm.stopPrank();

        // Swap at default 10% provider share
        uint256 swapIn = 1_000e18;
        token0.mint(bob, swapIn);
        vm.startPrank(bob);
        token0.approve(poolAddr, swapIn);
        pool.swap(sorted0, swapIn, 0, type(uint256).max);
        vm.stopPrank();

        uint256 stakingAfterFirst = token0.balanceOf(address(staking));

        // Change provider share to 20%
        feeConfig.setProviderShare(2000);

        // Second swap
        token0.mint(bob, swapIn);
        vm.startPrank(bob);
        token0.approve(poolAddr, swapIn);
        pool.swap(sorted0, swapIn, 0, type(uint256).max);
        vm.stopPrank();

        uint256 stakingAfterSecond = token0.balanceOf(address(staking));
        uint256 secondProviderAmount = stakingAfterSecond - stakingAfterFirst;

        // Should be 20% of saikoFee now
        uint256 poolFee = (swapIn * 100) / 10_000;
        uint256 saikoFee = (poolFee * 5000) / 10_000;
        uint256 expectedProvider = (saikoFee * 2000) / 10_000;

        assertEq(secondProviderAmount, expectedProvider);
    }

    // ── Change customPoolDefaultFee, create new pool at new default ────────

    function test_newPoolAtNewDefault() public {
        // Lower default to 50 BPS
        feeConfig.setCustomPoolDefaultFee(50);

        address poolAddr = factory.createPool(address(saiko), address(weth), 50);
        SaikoCustomPool pool = SaikoCustomPool(poolAddr);
        assertEq(pool.feeBPS(), 50);

        // Trying to create at old default (100) should fail
        MockERC20 tokenC = new MockERC20("TokenC", "TKC");
        vm.expectRevert("Fee exceeds max");
        factory.createPool(address(saiko), address(tokenC), 100);
    }

    // ── Router + Pool integration ──────────────────────────────────────────

    function test_routerAndPoolTogether() public {
        // Test that router and pool both read from same feeConfig
        address poolAddr = factory.createPool(address(saiko), address(weth), 100);
        staking.setAuthorisedCaller(poolAddr, true);

        // Both should be reading from the same feeConfig
        assertEq(address(feeConfig), address(router.feeConfig()));

        // Verify router fee split
        saiko.mint(alice, 1_000e18);
        uint256 treasuryBefore = saiko.balanceOf(treasury);

        vm.startPrank(alice);
        saiko.approve(address(router), 1_000e18);
        router.collectFee(1_000e18, bytes32(0));
        vm.stopPrank();

        // All to treasury (bytes32(0) commitment)
        assertEq(saiko.balanceOf(treasury) - treasuryBefore, 1_000e18);
    }
}

