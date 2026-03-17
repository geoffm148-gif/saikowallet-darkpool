// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RunOnChainTests
/// @notice Executes the full on-chain test checklist against the deployed
///         restricted test contracts. Verifies every fee split, every edge case,
///         and the lockedNoteAmount critical fix on real mainnet.

import "forge-std/Script.sol";
import "../src/SaikoFeeConfig.sol";
import "../src/SaikoDarkPoolV4Restricted.sol";
import "../src/SaikoPoolFactory.sol";
import "../src/SaikoCustomPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWETH {
    function deposit() external payable;
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IUniswapV2Router {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}

interface IERC20Ext is IERC20 {
    function approve(address, uint256) external returns (bool);
}

contract RunOnChainTests is Script {
    // ── Deployed test contracts ────────────────────────────────────────────
    address constant FEE_CONFIG  = 0x0fc98ED8854AB7d92a3cB2989742Ea973b4a2DF1;
    address constant ROUTER_V2   = 0xa32Ca96F8696975937dBD2A6c1f4ebB12474e780;
    address constant DARK_POOL   = 0x4127e741a3C7654733Da8329dd69F3ce508A3023;
    address constant FACTORY     = 0x5E231f9B83763840901A2Ac25c28982218bA5788;

    // ── Tokens ────────────────────────────────────────────────────────────
    address constant SAIKO       = 0x4c89364F18Ecc562165820989549022e64eC2eD2;
    address constant WETH        = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant DEPLOYER    = 0xFA2B4cAA3B4723F86e8bCAA9bB5812828d7e55e3;
    address constant UNI_ROUTER  = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    // Separate treasury so balance checks don't mix with deployer's own spend
    address constant TEST_TREASURY = 0x000000000000000000000000000000000000dEaD;

    uint256 constant TIER_1      = 100e18;
    uint256 constant BPS         = 10_000;

    uint256 passed;
    uint256 failed;

    function check(string memory label, bool condition, string memory detail) internal {
        if (condition) {
            console.log(string.concat("  [PASS] ", label));
            passed++;
        } else {
            console.log(string.concat("  [FAIL] ", label, " -- ", detail));
            failed++;
        }
    }

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(deployerKey);

        SaikoFeeConfig feeConfig       = SaikoFeeConfig(FEE_CONFIG);
        SaikoDarkPoolV4Restricted pool = SaikoDarkPoolV4Restricted(DARK_POOL);
        SaikoPoolFactory factory       = SaikoPoolFactory(FACTORY);
        IERC20Ext saiko                = IERC20Ext(SAIKO);

        // ── Fund deployer with SAIKO via Uniswap V2 ───────────────────────
        {
            address[] memory path = new address[](2);
            path[0] = WETH;
            path[1] = SAIKO;
            IUniswapV2Router(UNI_ROUTER).swapExactETHForTokens{value: 0.004 ether}(
                0,              // amountOutMin — accept any amount
                path,
                DEPLOYER,
                block.timestamp + 300
            );
            console.log("Funded deployer with SAIKO via Uniswap V2");
            console.log("SAIKO balance:", IERC20Ext(SAIKO).balanceOf(DEPLOYER));
        }

        // Set a separate treasury so deployer's spend doesn't corrupt balance checks
        SaikoFeeConfig(FEE_CONFIG).setTreasury(payable(TEST_TREASURY));

        console.log("\n====== SAIKO V2 ON-CHAIN TEST SUITE ======");
        console.log("DarkPool:  ", DARK_POOL);
        console.log("FeeConfig: ", FEE_CONFIG);
        console.log("Factory:   ", FACTORY);

        // ── TEST 1: Deposit TIER_1, verify fee split ───────────────────────
        console.log("\n--- Test 1: Deposit + fee split ---");
        {
            bytes32 commit1   = keccak256("test-commit-1");
            bytes32 claimKey1 = keccak256("test-claimkey-1");

            uint256 feeBPS      = feeConfig.darkpoolFeeBPS();   // 50
            uint256 provBPS     = feeConfig.providerShareBPS(); // 1000
            uint256 fee         = (TIER_1 * feeBPS) / BPS;
            uint256 stakingFee  = (fee * provBPS) / BPS;
            uint256 treasuryFee = fee - stakingFee;
            uint256 noteAmt     = TIER_1 - fee;

            uint256 treasuryBefore = saiko.balanceOf(feeConfig.treasury());

            saiko.approve(DARK_POOL, TIER_1);
            pool.deposit(commit1, TIER_1, claimKey1);

            uint256 treasuryGot = saiko.balanceOf(feeConfig.treasury()) - treasuryBefore;
            check("Treasury received correct fee",   treasuryGot == treasuryFee, vm.toString(treasuryGot));
            check("lockedNoteAmount set correctly",  pool.lockedNoteAmount(commit1) == noteAmt, vm.toString(pool.lockedNoteAmount(commit1)));
            check("commitmentAmount set correctly",  pool.commitmentAmount(commit1) == TIER_1, "");
        }

        // ── TEST 2: Withdraw, confirm lockedNoteAmount used (not live fee) ─
        console.log("\n--- Test 2: Withdraw uses lockedNoteAmount ---");
        {
            bytes32 commit2   = keccak256("test-commit-2");
            bytes32 claimKey2 = keccak256("test-claimkey-2");
            bytes32 nullifier2 = keccak256("test-null-2");

            saiko.approve(DARK_POOL, TIER_1);
            pool.deposit(commit2, TIER_1, claimKey2);

            uint256 locked = pool.lockedNoteAmount(commit2);
            bytes32 root   = pool.getLastRoot();

            uint256 balBefore = saiko.balanceOf(DEPLOYER);
            pool.withdraw(root, nullifier2, DEPLOYER, TIER_1, commit2);
            uint256 received = saiko.balanceOf(DEPLOYER) - balBefore;

            check("Received exactly lockedNoteAmount",  received == locked,      vm.toString(received));
            check("lockedNoteAmount cleared after withdrawal", pool.lockedNoteAmount(commit2) == 0, "");
            check("Nullifier marked spent",             pool.nullifierSpent(nullifier2), "");
        }

        // ── TEST 3: Fee change doesn't affect existing deposits ────────────
        console.log("\n--- Test 3: Fee change after deposit, old note unaffected ---");
        {
            bytes32 commit3   = keccak256("test-commit-3");
            bytes32 claimKey3 = keccak256("test-claimkey-3");
            bytes32 nullifier3 = keccak256("test-null-3");

            // Deposit at current fee (50 bps)
            saiko.approve(DARK_POOL, TIER_1);
            pool.deposit(commit3, TIER_1, claimKey3);
            uint256 lockedAtDeposit = pool.lockedNoteAmount(commit3);

            // Owner changes fee to 0 AFTER deposit
            feeConfig.setDarkPoolFee(0);

            bytes32 root = pool.getLastRoot();
            uint256 balBefore = saiko.balanceOf(DEPLOYER);
            pool.withdraw(root, nullifier3, DEPLOYER, TIER_1, commit3);
            uint256 received = saiko.balanceOf(DEPLOYER) - balBefore;

            check("Old deposit uses lockedNoteAmount despite fee=0", received == lockedAtDeposit, vm.toString(received));
            check("Did NOT receive full TIER_1 (would mean fee exploit)", received < TIER_1, "");

            // Restore fee
            feeConfig.setDarkPoolFee(50);
        }

        // ── TEST 4: setProviderShare(0) — 100% to treasury ────────────────
        console.log("\n--- Test 4: providerShare=0, all fees to treasury ---");
        {
            feeConfig.setProviderShare(0);
            bytes32 commit4   = keccak256("test-commit-4");
            bytes32 claimKey4 = keccak256("test-claimkey-4");

            uint256 fee = (TIER_1 * feeConfig.darkpoolFeeBPS()) / BPS;
            uint256 treasuryBefore = saiko.balanceOf(feeConfig.treasury());

            saiko.approve(DARK_POOL, TIER_1);
            pool.deposit(commit4, TIER_1, claimKey4);

            uint256 treasuryGot = saiko.balanceOf(feeConfig.treasury()) - treasuryBefore;
            check("providerShare=0: 100% fee to treasury", treasuryGot == fee, vm.toString(treasuryGot));

            feeConfig.setProviderShare(1000); // restore
        }

        // ── TEST 5: setProviderShare(10000) — 100% to staking ─────────────
        console.log("\n--- Test 5: providerShare=10000, all fees to staking ---");
        {
            feeConfig.setProviderShare(10000);
            bytes32 commit5   = keccak256("test-commit-5");
            bytes32 claimKey5 = keccak256("test-claimkey-5");

            uint256 fee = (TIER_1 * feeConfig.darkpoolFeeBPS()) / BPS;
            uint256 treasuryBefore = saiko.balanceOf(feeConfig.treasury());

            saiko.approve(DARK_POOL, TIER_1);
            pool.deposit(commit5, TIER_1, claimKey5);

            uint256 treasuryGot = saiko.balanceOf(feeConfig.treasury()) - treasuryBefore;
            check("providerShare=10000: treasury gets 0", treasuryGot == 0, vm.toString(treasuryGot));

            feeConfig.setProviderShare(1000); // restore
        }

        // ── TEST 6: setTreasury redirect ───────────────────────────────────
        console.log("\n--- Test 6: setTreasury redirects fees immediately ---");
        {
            address newTreasury = address(0xBEEF00000000000000000000000000000000BEEf);
            feeConfig.setTreasury(payable(newTreasury));

            bytes32 commit6   = keccak256("test-commit-6");
            bytes32 claimKey6 = keccak256("test-claimkey-6");

            uint256 fee         = (TIER_1 * feeConfig.darkpoolFeeBPS()) / BPS;
            uint256 provBPS     = feeConfig.providerShareBPS();
            uint256 stakingFee  = (fee * provBPS) / BPS;
            uint256 treasuryFee = fee - stakingFee;

            uint256 newTreasuryBefore = saiko.balanceOf(newTreasury);
            uint256 oldTreasuryBefore = saiko.balanceOf(TEST_TREASURY);

            saiko.approve(DARK_POOL, TIER_1);
            pool.deposit(commit6, TIER_1, claimKey6);

            check("New treasury received fee",  saiko.balanceOf(newTreasury) - newTreasuryBefore == treasuryFee, "");
            check("Old treasury received nothing", saiko.balanceOf(TEST_TREASURY) - oldTreasuryBefore == 0, "");

            // Restore treasury to TEST_TREASURY for remaining tests
            feeConfig.setTreasury(payable(TEST_TREASURY));
        }

        // ── TEST 7: Custom pool — create, add liquidity, swap, fee split ───
        console.log("\n--- Test 7: Custom pool fee split ---");
        {
            // Wrap 0.001 ETH to WETH for pool liquidity
            IWETH(WETH).deposit{value: 0.001 ether}();

            // Create SAIKO/WETH pool at 1% fee
            address poolAddr = factory.createPool(SAIKO, WETH, 100);
            SaikoCustomPool customPool = SaikoCustomPool(poolAddr);

            uint256 liqSaiko = 1_000e18;
            uint256 liqWeth  = 0.0005 ether;

            saiko.approve(poolAddr, liqSaiko);
            IWETH(WETH).approve(poolAddr, liqWeth);
            customPool.addLiquidity(liqSaiko, liqWeth, 0, type(uint256).max);

            // Determine sorted token order
            address sortedA = address(customPool.tokenA());
            bool saikoIsA   = sortedA == SAIKO;

            uint256 swapIn  = 10e18; // 10 SAIKO in
            saiko.approve(poolAddr, swapIn);

            uint256 saikoCutBPS  = feeConfig.saikoCustomCutBPS(); // 5000 = 50%
            uint256 provBPS      = feeConfig.providerShareBPS();  // 1000 = 10%
            uint256 poolFeeBPS   = 100; // 1%

            uint256 poolFee      = (swapIn * poolFeeBPS) / BPS;
            uint256 saikoFee     = (poolFee * saikoCutBPS) / BPS;
            uint256 treasuryFee  = saikoFee - (saikoFee * provBPS / BPS);

            uint256 treasuryBefore = saiko.balanceOf(feeConfig.treasury());

            customPool.swap(SAIKO, swapIn, 0, type(uint256).max);

            uint256 treasuryGot = saiko.balanceOf(feeConfig.treasury()) - treasuryBefore;
            check("Custom pool: treasury received correct Saiko cut", treasuryGot == treasuryFee,
                  string.concat("got=", vm.toString(treasuryGot), " expected=", vm.toString(treasuryFee)));
        }

        // ── TEST 8: setSaikoCustomCut(7000) — LP still gets 30% of pool fees
        console.log("\n--- Test 8: saikoCustomCut=70% (max), LP gets 30% of pool fee ---");
        {
            feeConfig.setSaikoCustomCut(7000);

            // Use the existing SAIKO/WETH pool — changing cut is live on next swap
            SaikoCustomPool existingPool = SaikoCustomPool(factory.getPool(SAIKO, WETH));

            uint256 swapIn = 10e18;
            saiko.approve(address(existingPool), swapIn);

            uint256 poolFee     = (swapIn * existingPool.feeBPS()) / BPS;
            uint256 saikoFee    = (poolFee * 7000) / BPS; // 70% cut to Saiko
            uint256 lpFee       = poolFee - saikoFee;     // 30% to LPs

            uint256 reserveABefore = existingPool.reserveA();
            existingPool.swap(SAIKO, swapIn, 0, type(uint256).max);
            uint256 reserveAAfter = existingPool.reserveA();

            // reserveA increase = amountInAfterFee + lpFee = (swapIn - poolFee) + lpFee
            uint256 expectedReserveGrowth = swapIn - poolFee + lpFee;
            uint256 actualReserveGrowth   = reserveAAfter - reserveABefore;
            check("saikoCustomCut=70%: LP gets 30% of pool fee, reserve grows correctly",
                  actualReserveGrowth == expectedReserveGrowth,
                  string.concat("got=", vm.toString(actualReserveGrowth), " expected=", vm.toString(expectedReserveGrowth)));

            feeConfig.setSaikoCustomCut(5000); // restore
        }

        // Restore treasury to deployer
        feeConfig.setTreasury(payable(DEPLOYER));

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────
        console.log("\n==========================================");
        console.log(string.concat("PASSED: ", vm.toString(passed)));
        console.log(string.concat("FAILED: ", vm.toString(failed)));
        if (failed == 0) {
            console.log("ALL CHECKS PASSED - contracts behaving correctly on-chain");
        } else {
            console.log("SOME CHECKS FAILED - review output above");
        }
        console.log("==========================================");
    }
}
