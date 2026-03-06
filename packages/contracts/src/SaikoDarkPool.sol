// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoDarkPool
/// @author Saiko Wallet
/// @notice Privacy-preserving deposit/withdrawal pool using commitment-nullifier scheme.
///         Deposits are made into fixed-amount tiers. Withdrawals require knowledge of the
///         secret nullifier preimage registered at deposit time. A 0.5% fee is split between
///         the treasury (90%) and the staking reward pool (10%).
/// @dev The current nullifier-commitment scheme is a secure placeholder. In production,
///      this will be replaced with a full ZK proof (snarkjs PLONK).

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";

contract SaikoDarkPool is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable saiko;
    address public immutable treasury;
    ISaikoDarkPoolStaking public staking;

    // Fixed deposit tiers (all in SAIKO, 18 decimals)
    uint256 public constant TIER_1 = 10_000_000e18;       // 10M SAIKO
    uint256 public constant TIER_2 = 100_000_000e18;      // 100M SAIKO
    uint256 public constant TIER_3 = 1_000_000_000e18;    // 1B SAIKO
    uint256 public constant TIER_4 = 10_000_000_000e18;   // 10B SAIKO

    uint256 public constant FEE_BPS = 50;                 // 0.5%
    uint256 public constant REWARD_SHARE_BPS = 1000;      // 10% of fee to staking
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Whether a commitment has been deposited
    mapping(bytes32 => bool) public commitments;

    /// @notice Maps nullifierHash to the commitment it was registered with
    mapping(bytes32 => bytes32) public nullifierToCommitment;

    /// @notice Whether a nullifierHash has been spent (prevents double-withdrawal)
    mapping(bytes32 => bool) public nullifierSpent;

    /// @notice The original deposit tier amount for each commitment
    mapping(bytes32 => uint256) public commitmentAmount;

    /// @notice Pool balance per tier (sum of note amounts for that tier)
    mapping(uint256 => uint256) public tierBalance;

    event Deposit(
        bytes32 indexed commitment,
        uint256 inputAmount,
        uint256 noteAmount,
        uint256 fee,
        address indexed depositor
    );
    event Withdrawal(
        bytes32 indexed nullifierHash,
        bytes32 indexed commitment,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Deploy the dark pool
    /// @param _saiko Address of the SAIKO ERC20 token
    /// @param _treasury Address that receives treasury fee share
    /// @param _staking Address of the SaikoDarkPoolStaking contract
    constructor(
        address _saiko,
        address _treasury,
        address _staking
    ) Ownable(msg.sender) {
        saiko = IERC20(_saiko);
        treasury = _treasury;
        staking = ISaikoDarkPoolStaking(_staking);
    }

    /// @notice Deposit SAIKO into the pool, creating a shielded note
    /// @dev The depositor chooses a secret nullifier, computes nullifierHash = keccak256(nullifier),
    ///      and passes the nullifierHash. Only someone who knows the preimage can withdraw later.
    /// @param commitment A unique hash identifying this deposit note
    /// @param nullifierHash The keccak256 hash of the depositor's secret nullifier
    /// @param amount The deposit tier amount (must be TIER_1, TIER_2, TIER_3, or TIER_4)
    function deposit(
        bytes32 commitment,
        bytes32 nullifierHash,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(!commitments[commitment], "Commitment exists");
        require(nullifierHash != bytes32(0), "Invalid nullifier hash");
        require(nullifierToCommitment[nullifierHash] == bytes32(0), "Nullifier hash already used");
        require(_isValidTier(amount), "Invalid tier");

        saiko.safeTransferFrom(msg.sender, address(this), amount);

        // Fee split: 0.5% total fee -> 10% to staking, 90% to treasury
        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 stakingFee = (fee * REWARD_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = fee - stakingFee;
        uint256 noteAmount = amount - fee;

        saiko.safeTransfer(treasury, treasuryFee);
        saiko.forceApprove(address(staking), stakingFee);
        staking.accrueReward(commitment, nullifierHash, noteAmount, stakingFee);

        commitments[commitment] = true;
        nullifierToCommitment[nullifierHash] = commitment;
        commitmentAmount[commitment] = amount;
        tierBalance[amount] += noteAmount;

        emit Deposit(commitment, amount, noteAmount, fee, msg.sender);
    }

    /// @notice Withdraw a shielded note by proving knowledge of the secret nullifier
    /// @dev The caller must provide the raw nullifier whose keccak256 hash was registered on deposit.
    ///      The withdrawal amount is derived from the stored deposit amount (not user-supplied).
    /// @param nullifier The secret nullifier preimage (keccak256(nullifier) must match stored nullifierHash)
    /// @param commitment The commitment hash of the note to withdraw
    /// @param recipient The address to receive the withdrawn tokens
    function withdraw(
        bytes32 nullifier,
        bytes32 commitment,
        address recipient
    ) external nonReentrant whenNotPaused {
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        require(commitments[commitment], "No such commitment");
        require(nullifierToCommitment[nullifierHash] == commitment, "Invalid proof");
        require(!nullifierSpent[nullifierHash], "Note already spent");

        nullifierSpent[nullifierHash] = true;

        // Derive amount from stored deposit — never trust user-supplied amount
        uint256 depositAmount = commitmentAmount[commitment];
        uint256 fee = (depositAmount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 noteAmount = depositAmount - fee;
        tierBalance[depositAmount] -= noteAmount;

        // Claim any accrued staking rewards to recipient
        staking.claimReward(commitment, recipient);

        saiko.safeTransfer(recipient, noteAmount);

        emit Withdrawal(nullifierHash, commitment, recipient, depositAmount);
    }

    /// @notice Pause the contract (deposits and withdrawals)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Check whether an amount corresponds to a valid deposit tier
    /// @param amount The amount to check
    /// @return True if the amount matches a valid tier
    function _isValidTier(uint256 amount) internal pure returns (bool) {
        return amount == TIER_1 || amount == TIER_2 || amount == TIER_3 || amount == TIER_4;
    }
}
