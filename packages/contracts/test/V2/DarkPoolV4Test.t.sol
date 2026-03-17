// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SaikoDarkPoolV4.sol";
import "../../src/SaikoFeeConfig.sol";
import "../../src/SaikoDarkPoolStaking.sol";
import "../mocks/MockERC20.sol";

/// @dev Mock verifier that always returns true (for unit tests without real ZK proofs)
contract MockVerifier {
    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[5] calldata
    ) external pure returns (bool) {
        return true;
    }
}

/// @dev Mock PoseidonT3 for unit tests
contract MockPoseidonT3 {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(inputs[0], inputs[1]))) % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    }
}

contract DarkPoolV4Test is Test {
    MockERC20 token;
    SaikoFeeConfig feeConfig;
    SaikoDarkPoolStaking staking;
    SaikoDarkPoolV4 darkPool;
    MockVerifier verifier;
    MockPoseidonT3 poseidon;

    address payable treasury = payable(address(0xBEEF));
    address alice = address(0xA11CE);

    uint256 constant TIER_1 = 10_000_000e18;
    uint256 constant BPS = 10_000;

    function setUp() public {
        token = new MockERC20("Saiko", "SAIKO");
        feeConfig = new SaikoFeeConfig(treasury);
        verifier = new MockVerifier();
        poseidon = new MockPoseidonT3();
        staking = new SaikoDarkPoolStaking(address(token), address(0));

        darkPool = new SaikoDarkPoolV4(
            20,
            address(verifier),
            address(poseidon),
            address(token),
            address(staking),
            address(feeConfig)
        );

        staking.setPool(address(darkPool));
        staking.setAuthorisedCaller(address(darkPool), true);
    }

    // ── Deposit charges correct fee at default darkpoolFeeBPS ──────────────

    function test_deposit_defaultFee() public {
        bytes32 commitment = keccak256("commit1");
        bytes32 claimKeyHash = keccak256("key1");

        token.mint(alice, TIER_1);
        uint256 treasuryBefore = token.balanceOf(treasury);

        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKeyHash);
        vm.stopPrank();

        // Default fee = 50 BPS = 0.5%
        uint256 fee = (TIER_1 * 50) / BPS;
        uint256 stakingFee = (fee * 1000) / BPS; // 10% of fee
        uint256 treasuryFee = fee - stakingFee;

        assertEq(token.balanceOf(treasury) - treasuryBefore, treasuryFee);
        assertEq(darkPool.commitmentAmount(commitment), TIER_1);
    }

    // ── Fee split goes correctly to treasury + staking ─────────────────────

    function test_deposit_feeSplit() public {
        bytes32 commitment = keccak256("commit2");
        bytes32 claimKeyHash = keccak256("key2");

        token.mint(alice, TIER_1);
        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 stakingBefore = token.balanceOf(address(staking));

        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKeyHash);
        vm.stopPrank();

        uint256 fee = (TIER_1 * 50) / BPS;
        uint256 stakingFee = (fee * 1000) / BPS;
        uint256 treasuryFee = fee - stakingFee;

        assertEq(token.balanceOf(treasury) - treasuryBefore, treasuryFee);
        assertEq(token.balanceOf(address(staking)) - stakingBefore, stakingFee);
    }

    // ── Fee changes when admin updates darkpoolFeeBPS ──────────────────────

    function test_deposit_feeChangesAfterUpdate() public {
        // Change darkpool fee to 100 BPS (1%)
        feeConfig.setDarkPoolFee(100);

        bytes32 commitment = keccak256("commit3");
        bytes32 claimKeyHash = keccak256("key3");

        token.mint(alice, TIER_1);
        uint256 treasuryBefore = token.balanceOf(treasury);

        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKeyHash);
        vm.stopPrank();

        uint256 fee = (TIER_1 * 100) / BPS; // 1% fee now
        uint256 stakingFee = (fee * 1000) / BPS;
        uint256 treasuryFee = fee - stakingFee;

        assertEq(token.balanceOf(treasury) - treasuryBefore, treasuryFee);
    }

    // ── providerShare change reflects in next deposit ──────────────────────

    function test_deposit_providerShareChange() public {
        feeConfig.setProviderShare(2000); // 20% to providers

        bytes32 commitment = keccak256("commit4");
        bytes32 claimKeyHash = keccak256("key4");

        token.mint(alice, TIER_1);
        uint256 stakingBefore = token.balanceOf(address(staking));

        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKeyHash);
        vm.stopPrank();

        uint256 fee = (TIER_1 * 50) / BPS;
        uint256 stakingFee = (fee * 2000) / BPS; // 20% of fee now

        assertEq(token.balanceOf(address(staking)) - stakingBefore, stakingFee);
    }

    // ── Withdrawal charges correct fee ─────────────────────────────────────

    function test_withdrawal_chargesFee() public {
        bytes32 commitment = keccak256("commit5");
        bytes32 claimKeyHash = keccak256("key5");

        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKeyHash);
        vm.stopPrank();

        // Get the root after deposit
        bytes32 root = darkPool.getLastRoot();
        bytes32 nullifierHash = keccak256("nullifier5");
        address recipient = address(0xCAFE);

        uint256 recipientBefore = token.balanceOf(recipient);

        // Withdraw with mock proof
        darkPool.withdraw(
            [uint256(0), uint256(0)],
            [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
            [uint256(0), uint256(0)],
            root,
            nullifierHash,
            recipient,
            TIER_1,
            commitment
        );

        uint256 fee = (TIER_1 * 50) / BPS;
        uint256 noteAmount = TIER_1 - fee;

        assertEq(token.balanceOf(recipient) - recipientBefore, noteAmount);
    }

    // ── Pause/unpause works ────────────────────────────────────────────────

    function test_pause_blocksDeposit() public {
        darkPool.pause();

        bytes32 commitment = keccak256("commit6");
        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        vm.expectRevert();
        darkPool.deposit(commitment, TIER_1, keccak256("key6"));
        vm.stopPrank();
    }

    function test_unpause_allowsDeposit() public {
        darkPool.pause();
        darkPool.unpause();

        bytes32 commitment = keccak256("commit7");
        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, keccak256("key7"));
        vm.stopPrank();

        assertEq(darkPool.commitmentAmount(commitment), TIER_1);
    }

    // ── CRITICAL FIX: fee changes after deposit must not affect withdrawals ──

    function test_withdrawal_feeLockedAtDeposit_feeDecreasedToZero() public {
        // Deposit at 50bps. Owner then sets fee to 0.
        // Withdrawal must still use the original noteAmount — not cause underflow/revert.
        bytes32 commitment = keccak256("lock-test-1");
        bytes32 claimKey   = keccak256("lock-key-1");
        bytes32 nullifier  = keccak256("lock-null-1");

        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKey);
        vm.stopPrank();

        // Record the locked note amount
        uint256 locked = darkPool.lockedNoteAmount(commitment);
        uint256 expected = TIER_1 - (TIER_1 * 50 / BPS); // 0.5% fee

        assertEq(locked, expected, "locked note amount should be set at deposit");

        // Owner changes fee to 0 AFTER deposit
        feeConfig.setDarkPoolFee(0);

        uint256 recipientBefore = token.balanceOf(alice);

        // Withdrawal must succeed and pay locked amount, not TIER_1
        uint256[2] memory pA; uint256[2][2] memory pB; uint256[2] memory pC;
        bytes32 root = darkPool.getLastRoot();
        darkPool.withdraw(pA, pB, pC, root, nullifier, alice, TIER_1, commitment);

        uint256 received = token.balanceOf(alice) - recipientBefore;
        assertEq(received, locked, "must receive locked amount, not full TIER_1");
        assertLt(received, TIER_1, "must not receive more than deposited (no free money)");
    }

    function test_withdrawal_feeLockedAtDeposit_feeIncreased() public {
        // Deposit at 50bps. Owner raises fee to 150bps.
        // Withdrawal must still honour original noteAmount — user is not penalised twice.
        bytes32 commitment = keccak256("lock-test-2");
        bytes32 claimKey   = keccak256("lock-key-2");
        bytes32 nullifier  = keccak256("lock-null-2");

        token.mint(alice, TIER_1);
        vm.startPrank(alice);
        token.approve(address(darkPool), TIER_1);
        darkPool.deposit(commitment, TIER_1, claimKey);
        vm.stopPrank();

        uint256 locked = darkPool.lockedNoteAmount(commitment);

        // Owner raises fee
        feeConfig.setDarkPoolFee(150);

        uint256 recipientBefore = token.balanceOf(alice);

        uint256[2] memory pA; uint256[2][2] memory pB; uint256[2] memory pC;
        bytes32 root = darkPool.getLastRoot();
        darkPool.withdraw(pA, pB, pC, root, nullifier, alice, TIER_1, commitment);

        uint256 received = token.balanceOf(alice) - recipientBefore;
        assertEq(received, locked, "must receive amount locked at deposit regardless of fee increase");
    }

    // ── updateFeeConfig ────────────────────────────────────────────────────

    function test_updateFeeConfig() public {
        SaikoFeeConfig newConfig = new SaikoFeeConfig(treasury);
        darkPool.updateFeeConfig(address(newConfig));
        assertEq(address(darkPool.feeConfig()), address(newConfig));
    }

    function test_revert_updateFeeConfig_zeroAddress() public {
        vm.expectRevert("Zero feeConfig");
        darkPool.updateFeeConfig(address(0));
    }

    function test_revert_updateFeeConfig_nonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        darkPool.updateFeeConfig(address(0x1234));
    }

    // ── Constructor validation ─────────────────────────────────────────────

    function test_revert_constructor_zeroVerifier() public {
        vm.expectRevert("Zero verifier");
        new SaikoDarkPoolV4(
            20, address(0), address(poseidon), address(token),
            address(staking), address(feeConfig)
        );
    }

    function test_revert_constructor_zeroSaiko() public {
        vm.expectRevert("Zero saiko");
        new SaikoDarkPoolV4(
            20, address(verifier), address(poseidon), address(0),
            address(staking), address(feeConfig)
        );
    }

    function test_revert_constructor_zeroStaking() public {
        vm.expectRevert("Zero staking");
        new SaikoDarkPoolV4(
            20, address(verifier), address(poseidon), address(token),
            address(0), address(feeConfig)
        );
    }

    function test_revert_constructor_zeroFeeConfig() public {
        vm.expectRevert("Zero feeConfig");
        new SaikoDarkPoolV4(
            20, address(verifier), address(poseidon), address(token),
            address(staking), address(0)
        );
    }
}
