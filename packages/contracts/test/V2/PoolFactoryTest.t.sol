// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoPoolFactory.sol";
import "../../src/SaikoFeeConfig.sol";
import "../../src/SaikoDarkPoolStaking.sol";
import "../../src/SaikoCustomPool.sol";
import "../mocks/MockERC20.sol";

contract PoolFactoryTest is Test {
    MockERC20 tokenA;
    MockERC20 tokenB;
    MockERC20 tokenC;
    SaikoFeeConfig feeConfig;
    SaikoDarkPoolStaking staking;
    SaikoPoolFactory factory;
    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);

    function setUp() public {
        tokenA = new MockERC20("TokenA", "TKA");
        tokenB = new MockERC20("TokenB", "TKB");
        tokenC = new MockERC20("TokenC", "TKC");
        feeConfig = new SaikoFeeConfig(payable(address(0xBEEF)));
        staking = new SaikoDarkPoolStaking(address(tokenA), address(0));
        factory = new SaikoPoolFactory(address(feeConfig), address(staking));
        staking.setPoolFactory(address(factory));
    }

    // ── createPool creates pool with correct fee ───────────────────────────

    function test_createPool() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 100);
        assertTrue(pool != address(0));
        assertEq(SaikoCustomPool(pool).feeBPS(), 100);
    }

    function test_createPool_emitsEvent() public {
        (address token0, address token1) = address(tokenA) < address(tokenB)
            ? (address(tokenA), address(tokenB))
            : (address(tokenB), address(tokenA));

        // Check only indexed params (token0, token1), not data (pool address unknown)
        vm.expectEmit(true, true, false, false);
        emit SaikoPoolFactory.PoolCreated(token0, token1, address(0), 0);

        factory.createPool(address(tokenA), address(tokenB), 100);
    }

    function test_createPool_zeroFee() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 0);
        assertEq(SaikoCustomPool(pool).feeBPS(), 0);
    }

    // ── Duplicate pool reverts ─────────────────────────────────────────────

    function test_revert_duplicatePool() public {
        factory.createPool(address(tokenA), address(tokenB), 100);
        vm.expectRevert("Pool exists");
        factory.createPool(address(tokenA), address(tokenB), 50);
    }

    function test_revert_duplicatePool_reversedOrder() public {
        factory.createPool(address(tokenA), address(tokenB), 100);
        vm.expectRevert("Pool exists");
        factory.createPool(address(tokenB), address(tokenA), 50);
    }

    // ── Pool fee > max reverts ─────────────────────────────────────────────

    function test_revert_feeExceedsMax() public {
        vm.expectRevert("Fee exceeds max");
        factory.createPool(address(tokenA), address(tokenB), 101); // default max is 100
    }

    // ── Identical tokens revert ────────────────────────────────────────────

    function test_revert_identicalTokens() public {
        vm.expectRevert("Identical tokens");
        factory.createPool(address(tokenA), address(tokenA), 50);
    }

    // ── Zero address token reverts ─────────────────────────────────────────

    function test_revert_zeroToken() public {
        vm.expectRevert("Zero token");
        factory.createPool(address(0), address(tokenB), 50);
    }

    // ── getPool returns correct address ────────────────────────────────────

    function test_getPool() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 100);
        assertEq(factory.getPool(address(tokenA), address(tokenB)), pool);
        assertEq(factory.getPool(address(tokenB), address(tokenA)), pool); // reversed order
    }

    function test_getPool_nonExistent() public view {
        assertEq(factory.getPool(address(tokenA), address(tokenC)), address(0));
    }

    // ── Admin can override pool fee ────────────────────────────────────────

    function test_setPoolFee() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 100);
        factory.setPoolFee(pool, 150);
        assertEq(SaikoCustomPool(pool).feeBPS(), 150);
    }

    function test_revert_setPoolFee_exceedsAbsoluteMax() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 100);
        vm.expectRevert("Fee exceeds absolute max");
        factory.setPoolFee(pool, 201);
    }

    function test_revert_setPoolFee_nonOwner() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 100);
        vm.prank(alice);
        vm.expectRevert();
        factory.setPoolFee(pool, 50);
    }

    // ── updateFeeConfig ────────────────────────────────────────────────────

    function test_updateFeeConfig() public {
        SaikoFeeConfig newConfig = new SaikoFeeConfig(payable(address(0xBEEF)));
        factory.updateFeeConfig(address(newConfig));
        assertEq(address(factory.feeConfig()), address(newConfig));
    }

    function test_revert_updateFeeConfig_zeroAddress() public {
        vm.expectRevert("Zero feeConfig");
        factory.updateFeeConfig(address(0));
    }

    // ── Multiple pools ─────────────────────────────────────────────────────

    function test_multiplePools() public {
        address pool1 = factory.createPool(address(tokenA), address(tokenB), 50);
        address pool2 = factory.createPool(address(tokenA), address(tokenC), 75);
        address pool3 = factory.createPool(address(tokenB), address(tokenC), 100);

        assertTrue(pool1 != pool2);
        assertTrue(pool2 != pool3);
        assertEq(factory.getPool(address(tokenA), address(tokenB)), pool1);
        assertEq(factory.getPool(address(tokenA), address(tokenC)), pool2);
        assertEq(factory.getPool(address(tokenB), address(tokenC)), pool3);
    }
}

