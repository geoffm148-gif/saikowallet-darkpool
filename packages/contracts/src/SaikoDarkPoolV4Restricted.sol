// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoDarkPoolV4Restricted
/// @notice Test-only variant of SaikoDarkPoolV4.
///         - Small configurable tier amounts (not 10M+ SAIKO)
///         - Mock verifier always returns true (no ZK circuits needed for functional testing)
///         - Whitelist: only authorized addresses can deposit/withdraw
///         All fee logic, staking integration, lockedNoteAmount, and CEI patterns
///         are identical to the production contract.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";
import "./MerkleTreeWithHistory.sol";
import "./SaikoFeeConfig.sol";

contract SaikoDarkPoolV4Restricted is MerkleTreeWithHistory, ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable saiko;
    ISaikoDarkPoolStaking public staking;
    SaikoFeeConfig public feeConfig;

    // ── Test tier amounts (small, set at deploy) ───────────────────────────
    uint256 public immutable TIER_1;
    uint256 public immutable TIER_2;
    uint256 public immutable TIER_3;
    uint256 public immutable TIER_4;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── Whitelist ──────────────────────────────────────────────────────────
    mapping(address => bool) public authorized;

    modifier onlyAuthorized() {
        require(authorized[msg.sender], "Not authorized");
        _;
    }

    // ── State ──────────────────────────────────────────────────────────────
    mapping(bytes32 => bool)    public nullifierSpent;
    mapping(bytes32 => uint256) public commitmentAmount;
    mapping(uint256 => uint256) public tierBalance;
    mapping(bytes32 => uint256) public lockedNoteAmount;

    // ── Events ─────────────────────────────────────────────────────────────
    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 inputAmount, uint256 noteAmount, uint256 fee);
    event Withdrawal(address indexed recipient, uint256 amount, uint256 fee);
    event StakingClaimFailed(bytes32 indexed commitment, address indexed recipient, bytes reason);
    event FeeConfigUpdated(address oldConfig, address newConfig);
    event AuthorizedUpdated(address indexed user, bool status);

    constructor(
        uint32  _levels,
        address _poseidonT3,
        address _saiko,
        address _staking,
        address _feeConfig,
        uint256 _tier1,
        uint256 _tier2,
        uint256 _tier3,
        uint256 _tier4
    ) MerkleTreeWithHistory(_levels, _poseidonT3) Ownable(msg.sender) {
        require(_saiko    != address(0), "Zero saiko");
        require(_staking  != address(0), "Zero staking");
        require(_feeConfig != address(0), "Zero feeConfig");
        require(_tier1 < _tier2 && _tier2 < _tier3 && _tier3 < _tier4, "Tiers must be ascending");

        saiko    = IERC20(_saiko);
        staking  = ISaikoDarkPoolStaking(_staking);
        feeConfig = SaikoFeeConfig(_feeConfig);
        TIER_1   = _tier1;
        TIER_2   = _tier2;
        TIER_3   = _tier3;
        TIER_4   = _tier4;

        // Authorize deployer by default
        authorized[msg.sender] = true;
        emit AuthorizedUpdated(msg.sender, true);
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setAuthorized(address user, bool status) external onlyOwner {
        authorized[user] = status;
        emit AuthorizedUpdated(user, status);
    }

    function updateFeeConfig(address _feeConfig) external onlyOwner {
        require(_feeConfig != address(0), "Zero feeConfig");
        address old = address(feeConfig);
        feeConfig = SaikoFeeConfig(_feeConfig);
        emit FeeConfigUpdated(old, _feeConfig);
    }

    function setStaking(address _staking) external onlyOwner {
        require(_staking != address(0), "Zero address");
        staking = ISaikoDarkPoolStaking(_staking);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Deposit ────────────────────────────────────────────────────────────

    function deposit(
        bytes32 commitment,
        uint256 amount,
        bytes32 claimKeyHash
    ) external nonReentrant whenNotPaused onlyAuthorized {
        require(commitmentAmount[commitment] == 0, "Commitment exists");
        require(_isValidTier(amount), "Invalid tier");
        require(claimKeyHash != bytes32(0), "Invalid claim key hash");

        saiko.safeTransferFrom(msg.sender, address(this), amount);

        uint256 feeBPS      = feeConfig.darkpoolFeeBPS();
        uint256 providerBPS = feeConfig.providerShareBPS();

        uint256 fee         = (amount * feeBPS) / BPS_DENOMINATOR;
        uint256 stakingFee  = (fee * providerBPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = fee - stakingFee;
        uint256 noteAmount  = amount - fee;

        if (treasuryFee > 0) saiko.safeTransfer(feeConfig.treasury(), treasuryFee);
        if (stakingFee > 0) {
            saiko.forceApprove(address(staking), stakingFee);
            staking.accrueReward(commitment, claimKeyHash, noteAmount, stakingFee);
        }

        commitmentAmount[commitment]  = amount;
        lockedNoteAmount[commitment]  = noteAmount;
        tierBalance[amount]          += noteAmount;

        uint32 leafIndex = _insert(commitment);
        emit Deposit(commitment, leafIndex, amount, noteAmount, fee);
    }

    // ── Withdraw ───────────────────────────────────────────────────────────
    // NOTE: In this test version the ZK verifier is skipped.
    // The commitment + nullifier must still be valid w.r.t. the Merkle tree
    // (commitment must have been deposited), but no ZK proof is required.
    // This lets on-chain functional testing proceed without matching circuits.

    function withdraw(
        bytes32 root,
        bytes32 nullifierHash,
        address recipient,
        uint256 amount,
        bytes32 commitment
    ) external nonReentrant whenNotPaused onlyAuthorized {
        require(isKnownRoot(root),            "Unknown root");
        require(!nullifierSpent[nullifierHash], "Already spent");
        require(recipient != address(0),       "Invalid recipient");
        require(_isValidTier(amount),          "Invalid tier");
        require(commitmentAmount[commitment] == amount, "Amount mismatch");

        uint256 noteAmount = lockedNoteAmount[commitment];
        require(noteAmount > 0, "Invalid note");
        uint256 fee = amount - noteAmount;

        nullifierSpent[nullifierHash] = true;
        delete lockedNoteAmount[commitment];
        tierBalance[amount] -= noteAmount;

        if (address(staking) != address(0)) {
            try staking.claimReward(commitment, recipient) {} catch (bytes memory reason) {
                emit StakingClaimFailed(commitment, recipient, reason);
            }
        }

        saiko.safeTransfer(recipient, noteAmount);
        emit Withdrawal(recipient, amount, fee);
    }

    function _isValidTier(uint256 amount) internal view returns (bool) {
        return amount == TIER_1 || amount == TIER_2 || amount == TIER_3 || amount == TIER_4;
    }
}
