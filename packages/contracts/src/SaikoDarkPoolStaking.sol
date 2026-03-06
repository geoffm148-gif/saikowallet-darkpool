// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoDarkPoolStaking
/// @author Saiko Wallet
/// @notice Dual Synthetix-style staking accumulator — earns both SAIKO and ETH.
///         SAIKO rewards: 10% of all SAIKO swap + deposit fees.
///         ETH rewards: 10% of all ETH swap fees collected by the router.
///         Notes (deposits) earn a pro-rata share of both reward pools.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";

contract SaikoDarkPoolStaking is ISaikoDarkPoolStaking, Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable saiko;
    address public pool;

    /// @notice Addresses authorised to call accrueReward / accrueEthReward
    mapping(address => bool) public authorisedCallers;

    /// @notice Maps commitment → depositor address (for claimManual auth)
    mapping(bytes32 => address) public commitmentOwner;

    // ── SAIKO reward accumulator ──────────────────────────────────────────────

    /// @notice Global SAIKO reward-per-token accumulator (scaled by 1e18)
    uint256 public rewardPerTokenStored;

    /// @notice Timestamp of last SAIKO reward state update
    uint256 public lastUpdateTime;

    /// @notice Total note amount currently staked
    uint256 public totalStaked;

    /// @notice Total undistributed SAIKO rewards
    uint256 public rewardPool;

    // ── ETH reward accumulator ────────────────────────────────────────────────

    /// @notice Global ETH reward-per-token accumulator (scaled by 1e18)
    uint256 public ethRewardPerTokenStored;

    /// @notice Timestamp of last ETH reward state update
    uint256 public ethLastUpdateTime;

    /// @notice Total undistributed ETH rewards (in wei)
    uint256 public ethRewardPool;

    // ── Per-note state ────────────────────────────────────────────────────────

    struct NoteInfo {
        uint256 amount;                  // Note stake amount
        uint256 rewardPerTokenPaid;      // SAIKO accumulator snapshot
        uint256 rewards;                 // Accrued SAIKO rewards
        uint256 ethRewardPerTokenPaid;   // ETH accumulator snapshot
        uint256 ethRewards;              // Accrued ETH rewards (wei)
        bool active;
    }

    mapping(bytes32 => NoteInfo) public notes;

    // ── Events ────────────────────────────────────────────────────────────────

    event RewardAccrued(bytes32 indexed commitment, uint256 saikoAmount, uint256 ethAmount);
    event RewardClaimed(bytes32 indexed commitment, address indexed recipient, uint256 saikoAmount, uint256 ethAmount);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyPool() {
        require(msg.sender == pool, "Only pool");
        _;
    }

    modifier onlyAuthorised() {
        require(authorisedCallers[msg.sender], "Not authorised");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _saiko, address _pool) Ownable(msg.sender) {
        saiko = IERC20(_saiko);
        if (_pool != address(0)) {
            pool = _pool;
            authorisedCallers[_pool] = true;
        }
        lastUpdateTime = block.timestamp;
        ethLastUpdateTime = block.timestamp;
    }

    /// @notice Accept ETH sent directly (e.g. from router ETH fee distribution)
    receive() external payable {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setPool(address _pool) external onlyOwner {
        pool = _pool;
        authorisedCallers[_pool] = true;
    }

    function setAuthorisedCaller(address caller, bool status) external onlyOwner {
        authorisedCallers[caller] = status;
    }

    // ── SAIKO rewards ─────────────────────────────────────────────────────────

    /// @notice Accrue a SAIKO fee reward and optionally register a new note
    function accrueReward(
        bytes32 commitment,
        bytes32 depositor,          // tx.origin / depositor address as bytes32 (for claimManual auth)
        uint256 noteAmount,
        uint256 feeAmount
    ) external override onlyAuthorised {
        _updateSaikoState(bytes32(0));
        rewardPool += feeAmount;
        saiko.safeTransferFrom(msg.sender, address(this), feeAmount);

        if (noteAmount > 0) {
            // Store the depositor address so they can call claimManual later
            commitmentOwner[commitment] = address(uint160(uint256(depositor)));
            notes[commitment] = NoteInfo({
                amount: noteAmount,
                rewardPerTokenPaid: rewardPerTokenStored,
                rewards: 0,
                ethRewardPerTokenPaid: ethRewardPerTokenStored,
                ethRewards: 0,
                active: true
            });
            totalStaked += noteAmount;
        }

        emit RewardAccrued(commitment, feeAmount, 0);
    }

    /// @notice Accrue ETH fee rewards into the ETH reward pool
    /// @dev Called by the router with msg.value = ETH staking share
    function accrueEthReward() external payable onlyAuthorised {
        require(msg.value > 0, "No ETH sent");
        _updateEthState(bytes32(0));
        ethRewardPool += msg.value;
        emit RewardAccrued(bytes32(0), 0, msg.value);
    }

    // ── View: SAIKO accumulator ───────────────────────────────────────────────

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 elapsed = block.timestamp - lastUpdateTime;
        uint256 rate = rewardPool / 86400 / 100;
        return rewardPerTokenStored + (rate * elapsed * 1e18) / totalStaked;
    }

    function earned(bytes32 commitment) public view returns (uint256) {
        NoteInfo storage note = notes[commitment];
        return (note.amount * (rewardPerToken() - note.rewardPerTokenPaid)) / 1e18 + note.rewards;
    }

    // ── View: ETH accumulator ─────────────────────────────────────────────────

    function ethRewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return ethRewardPerTokenStored;
        uint256 elapsed = block.timestamp - ethLastUpdateTime;
        uint256 rate = ethRewardPool / 86400 / 100;
        return ethRewardPerTokenStored + (rate * elapsed * 1e18) / totalStaked;
    }

    function earnedEth(bytes32 commitment) public view returns (uint256) {
        NoteInfo storage note = notes[commitment];
        return (note.amount * (ethRewardPerToken() - note.ethRewardPerTokenPaid)) / 1e18 + note.ethRewards;
    }

    // ── Claim: pool-triggered (on withdrawal) ─────────────────────────────────

    function claimReward(
        bytes32 commitment,
        address recipient
    ) external override onlyPool returns (uint256 claimed) {
        _updateSaikoState(commitment);
        _updateEthState(commitment);
        NoteInfo storage note = notes[commitment];

        claimed = note.rewards;
        uint256 ethClaimed = note.ethRewards;

        note.rewards = 0;
        note.ethRewards = 0;
        note.active = false;
        totalStaked -= note.amount;

        if (claimed > 0) {
            rewardPool -= claimed;
            saiko.safeTransfer(recipient, claimed);
        }
        if (ethClaimed > 0) {
            ethRewardPool -= ethClaimed;
            (bool ok,) = payable(recipient).call{value: ethClaimed}("");
            require(ok, "ETH transfer failed");
        }

        emit RewardClaimed(commitment, recipient, claimed, ethClaimed);
    }

    // ── Claim: manual (without withdrawing) ───────────────────────────────────

    /// @notice Manually claim both SAIKO and ETH rewards for a note
    /// @dev Only callable by the original depositor address (stored in commitmentOwner).
    ///      The recipient can be any address — you can claim rewards to a different wallet.
    /// @param commitment The deposit commitment hash
    /// @param recipient Address to receive rewards
    function claimManual(bytes32 commitment, address recipient) external {
        require(commitmentOwner[commitment] == msg.sender, "Not depositor");

        _updateSaikoState(commitment);
        _updateEthState(commitment);

        NoteInfo storage note = notes[commitment];
        require(note.active, "Note not active");

        uint256 saikoClaimed = note.rewards;
        uint256 ethClaimed = note.ethRewards;

        note.rewards = 0;
        note.ethRewards = 0;
        note.rewardPerTokenPaid = rewardPerTokenStored;
        note.ethRewardPerTokenPaid = ethRewardPerTokenStored;

        if (saikoClaimed > 0) {
            rewardPool -= saikoClaimed;
            saiko.safeTransfer(recipient, saikoClaimed);
        }
        if (ethClaimed > 0) {
            ethRewardPool -= ethClaimed;
            (bool ok,) = payable(recipient).call{value: ethClaimed}("");
            require(ok, "ETH transfer failed");
        }

        emit RewardClaimed(commitment, recipient, saikoClaimed, ethClaimed);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _updateSaikoState(bytes32 commitment) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (commitment != bytes32(0)) {
            NoteInfo storage note = notes[commitment];
            note.rewards = earned(commitment);
            note.rewardPerTokenPaid = rewardPerTokenStored;
        }
    }

    function _updateEthState(bytes32 commitment) internal {
        ethRewardPerTokenStored = ethRewardPerToken();
        ethLastUpdateTime = block.timestamp;
        if (commitment != bytes32(0)) {
            NoteInfo storage note = notes[commitment];
            note.ethRewards = earnedEth(commitment);
            note.ethRewardPerTokenPaid = ethRewardPerTokenStored;
        }
    }
}
