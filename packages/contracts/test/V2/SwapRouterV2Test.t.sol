// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoSwapRouterV2.sol";
import "../../src/SaikoFeeConfig.sol";
import "../../src/SaikoDarkPoolStaking.sol";
import "../mocks/MockERC20.sol";

contract SwapRouterV2Test is Test {
    MockERC20 token;
    SaikoFeeConfig feeConfig;
    SaikoDarkPoolStaking staking;
    SaikoSwapRouterV2 router;
    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);

    uint256 constant FEE = 1_000_000e18;

    function setUp() public {
        token = new MockERC20("Saiko", "SAIKO");
        feeConfig = new SaikoFeeConfig(treasury);
        staking = new SaikoDarkPoolStaking(address(token), address(0));
        router = new SaikoSwapRouterV2(
            address(feeConfig),
            address(token),
            address(staking)
        );
        staking.setAuthorisedCaller(address(router), true);
        router.setAuthorisedCaller(alice, true);
    }

    // ── collectFee splits correctly at default 90/10 ───────────────────────

    function test_collectFee_defaultSplit() public {
        uint256 treasuryBefore = token.balanceOf(treasury);
        token.mint(alice, FEE);

        vm.startPrank(alice);
        token.approve(address(router), FEE);
        // Using bytes32(0) commitment → staking share goes to treasury
        router.collectFee(FEE, bytes32(0));
        vm.stopPrank();

        // With bytes32(0) commitment, all goes to treasury
        assertEq(token.balanceOf(treasury) - treasuryBefore, FEE);
    }

    function test_collectFee_withCommitment_splitCorrectly() public {
        // Register a note in staking first so accrueReward works
        bytes32 commitment = keccak256("note1");
        uint256 noteAmount = 10_000_000e18;
        token.mint(address(this), noteAmount);
        token.approve(address(staking), noteAmount);
        staking.setAuthorisedCaller(address(this), true);
        staking.accrueReward(commitment, bytes32(0), noteAmount, 0);

        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 stakingBefore = token.balanceOf(address(staking));

        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, commitment);
        vm.stopPrank();

        // Default: 10% to staking, 90% to treasury
        uint256 expectedStaking = (FEE * 1000) / 10_000;
        uint256 expectedTreasury = FEE - expectedStaking;

        assertEq(token.balanceOf(treasury) - treasuryBefore, expectedTreasury);
        assertEq(token.balanceOf(address(staking)) - stakingBefore, expectedStaking);
    }

    // ── collectFee splits correctly when providerShare changed to 20% ──────

    function test_collectFee_providerShare20Percent() public {
        feeConfig.setProviderShare(2000); // 20%

        bytes32 commitment = keccak256("note2");
        uint256 noteAmount = 10_000_000e18;
        token.mint(address(this), noteAmount);
        token.approve(address(staking), noteAmount);
        staking.setAuthorisedCaller(address(this), true);
        staking.accrueReward(commitment, bytes32(0), noteAmount, 0);

        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 stakingBefore = token.balanceOf(address(staking));

        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, commitment);
        vm.stopPrank();

        uint256 expectedStaking = (FEE * 2000) / 10_000; // 20%
        uint256 expectedTreasury = FEE - expectedStaking;  // 80%

        assertEq(token.balanceOf(treasury) - treasuryBefore, expectedTreasury);
        assertEq(token.balanceOf(address(staking)) - stakingBefore, expectedStaking);
    }

    // ── collectEthFee splits correctly ─────────────────────────────────────

    function test_collectEthFee_defaultSplit() public {
        uint256 ethFee = 1 ether;
        vm.deal(alice, ethFee);

        uint256 treasuryBefore = treasury.balance;
        uint256 stakingBefore = address(staking).balance;

        vm.prank(alice);
        router.collectEthFee{value: ethFee}();

        uint256 expectedStaking = (ethFee * 1000) / 10_000; // 10%
        uint256 expectedTreasury = ethFee - expectedStaking; // 90%

        assertEq(treasury.balance - treasuryBefore, expectedTreasury);
        assertEq(address(staking).balance - stakingBefore, expectedStaking);
    }

    // ── Non-authorised caller reverts ──────────────────────────────────────

    function test_revert_nonAuthorised_collectFee() public {
        address bob = address(0xB0B);
        token.mint(bob, FEE);
        vm.startPrank(bob);
        token.approve(address(router), FEE);
        vm.expectRevert("Not authorised");
        router.collectFee(FEE, bytes32(0));
        vm.stopPrank();
    }

    function test_revert_nonAuthorised_collectEthFee() public {
        address bob = address(0xB0B);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert("Not authorised");
        router.collectEthFee{value: 1 ether}();
    }

    // ── Fee reads live from feeConfig ──────────────────────────────────────

    function test_feeReadsLiveFromConfig() public {
        // Start with default 10% provider share
        bytes32 commitment = keccak256("liveNote");
        uint256 noteAmount = 10_000_000e18;
        token.mint(address(this), noteAmount);
        token.approve(address(staking), noteAmount);
        staking.setAuthorisedCaller(address(this), true);
        staking.accrueReward(commitment, bytes32(0), noteAmount, 0);

        // First fee at 10%
        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, commitment);
        vm.stopPrank();

        uint256 stakingAfterFirst = token.balanceOf(address(staking));

        // Change to 30%
        feeConfig.setProviderShare(3000);

        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, commitment);
        vm.stopPrank();

        uint256 stakingAfterSecond = token.balanceOf(address(staking));
        uint256 secondStakingAmount = stakingAfterSecond - stakingAfterFirst;

        // 30% of FEE should go to staking
        assertEq(secondStakingAmount, (FEE * 3000) / 10_000);
    }

    // ── Zero fee edge case ─────────────────────────────────────────────────

    function test_collectFee_zeroProviderShare() public {
        feeConfig.setProviderShare(0); // 0% to providers

        uint256 treasuryBefore = token.balanceOf(treasury);

        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(router), FEE);
        router.collectFee(FEE, bytes32(0));
        vm.stopPrank();

        // 100% to treasury
        assertEq(token.balanceOf(treasury) - treasuryBefore, FEE);
    }

    // ── updateFeeConfig ────────────────────────────────────────────────────

    function test_updateFeeConfig() public {
        SaikoFeeConfig newConfig = new SaikoFeeConfig(treasury);
        newConfig.setProviderShare(2500);
        router.updateFeeConfig(address(newConfig));
        assertEq(address(router.feeConfig()), address(newConfig));
    }

    function test_revert_updateFeeConfig_zeroAddress() public {
        vm.expectRevert("Zero feeConfig");
        router.updateFeeConfig(address(0));
    }
}
