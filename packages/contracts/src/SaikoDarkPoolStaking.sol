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
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ISaikoDarkPoolStaking.sol";

contract SaikoDarkPoolStaking is ISaikoDarkPoolStaking, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable saiko;
    address public pool;

    /// @notice Treasury address — the only address permitted to call injectPoolReward
    address public treasury;

    /// @notice Addresses authorised to call accrueReward / accrueEthReward
    mapping(address => bool) public authorisedCallers;

    /// @notice Address of the pool factory — allowed to auto-authorise newly created pools
    address public poolFactory;

    /// @notice Maps commitment → claimKeyHash (for claimManual auth, V3: no address link)
    mapping(bytes32 => bytes32) public claimKeyHashes;

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

    // ── Per-pool bonus reward accumulator ─────────────────────────────────────
    // Owner can inject SAIKO directly into any pool to reward its stakers.
    // Rewards are distributed instantly pro-rata to all currently-active notes in that pool.

    /// @notice Per-pool bonus accumulator (scaled 1e18), increases on each injection
    mapping(address => uint256) public poolBonusPerToken;

    /// @notice Total staked amount across all active notes for each pool
    mapping(address => uint256) public poolBonusTotalStaked;

    /// @notice Total SAIKO reserved for pool bonus payouts
    uint256 public totalPoolBonusReserve;

    /// @notice SAIKO pre-loaded by treasury, available for pool reward injections
    uint256 public treasuryBonusBalance;

    // ── Per-note state ────────────────────────────────────────────────────────

    struct NoteInfo {
        uint256 amount;                  // Note stake amount
        uint256 rewardPerTokenPaid;      // SAIKO accumulator snapshot
        uint256 rewards;                 // Accrued SAIKO rewards
        uint256 ethRewardPerTokenPaid;   // ETH accumulator snapshot
        uint256 ethRewards;              // Accrued ETH rewards (wei)
        bool active;
        address sourcePool;              // Pool that registered this note
    }

    mapping(bytes32 => NoteInfo) public notes;

    /// @notice Per-note pool bonus accumulator snapshot (to calculate pending bonus)
    mapping(bytes32 => uint256) public notePoolBonusPaid;

    /// @notice Settled pool bonus awaiting claim
    mapping(bytes32 => uint256) public notePoolBonus;

    // ── Events ────────────────────────────────────────────────────────────────

    event RewardAccrued(bytes32 indexed commitment, uint256 saikoAmount, uint256 ethAmount);
    event RewardClaimed(address indexed recipient, uint256 saikoAmount, uint256 ethAmount);
    event PoolUpdated(address oldPool, address newPool);
    event AuthorisedCallerUpdated(address caller, bool status);
    event PoolFactoryUpdated(address oldFactory, address newFactory);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event TreasuryFunded(uint256 amount, uint256 newBalance);
    event PoolRewardInjected(address indexed pool, uint256 amount, uint256 activeStake);

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
        require(_pool != address(0), "zero address");
        address oldPool = pool;
        if (oldPool != address(0)) {
            authorisedCallers[oldPool] = false;
        }
        pool = _pool;
        authorisedCallers[_pool] = true;
        emit PoolUpdated(oldPool, _pool);
    }

    function setAuthorisedCaller(address caller, bool status) external onlyOwner {
        authorisedCallers[caller] = status;
        emit AuthorisedCallerUpdated(caller, status);
    }

    /// @notice Set the pool factory address (allowed to auto-authorise new pools)
    function setPoolFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "Zero factory");
        address old = poolFactory;
        poolFactory = _factory;
        emit PoolFactoryUpdated(old, _factory);
    }

    /// @notice Set the treasury address — the only address that can call injectPoolReward
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero treasury");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    /// @notice Authorise a newly created pool — callable only by the registered pool factory
    /// @dev Called by SaikoPoolFactory.createPool() so every pool is immediately usable
    function authorizePool(address _pool) external {
        require(msg.sender == poolFactory, "Only factory");
        require(_pool != address(0), "Zero pool");
        authorisedCallers[_pool] = true;
        emit AuthorisedCallerUpdated(_pool, true);
    }

    /// @notice Rescue non-SAIKO tokens accidentally sent or locked in this contract
    /// @dev Non-SAIKO provider fees from custom pools (e.g. WETH/USDC pairs) accumulate here
    ///      with no distribution path. This allows the owner to recover them.
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(saiko), "Cannot rescue SAIKO");
        require(to != address(0), "Zero recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Rescue ETH sent directly to this contract above the tracked ETH reward pool
    /// @dev Protects the tracked ethRewardPool — only genuine excess is recoverable
    function rescueETH(address payable to) external onlyOwner {
        require(to != address(0), "Zero recipient");
        uint256 excess = address(this).balance - ethRewardPool;
        require(excess > 0, "No excess ETH");
        (bool ok,) = to.call{value: excess}("");
        require(ok, "ETH rescue failed");
    }

    /// @notice Return unused treasury bonus balance to the treasury address
    /// @dev Allows the treasury to reclaim SAIKO that was pre-loaded but not yet injected
    function withdrawTreasuryBonus(uint256 amount) external {
        require(msg.sender == treasury, "Only treasury");
        require(amount > 0, "Zero amount");
        require(amount <= treasuryBonusBalance, "Insufficient balance");
        treasuryBonusBalance -= amount;
        saiko.safeTransfer(treasury, amount);
    }

    // ── Provider fee intake ─────────────────────────────────────────────────

    /// @notice Add tokens to the reward pool (e.g. provider share from custom pools)
    /// @dev Only SAIKO tokens are tracked in rewardPool accounting.
    ///      Non-SAIKO tokens are transferred in but not added to rewardPool.
    /// @param token The token being sent
    /// @param amount Amount of tokens to add
    function addToRewardPool(IERC20 token, uint256 amount) external onlyAuthorised whenNotPaused {
        require(amount > 0, "Zero amount");
        if (token == saiko) {
            _updateSaikoState(bytes32(0));
            rewardPool += amount;
        }
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ── Pool bonus rewards ────────────────────────────────────────────────────

    /// @notice Pre-load SAIKO into the bonus pool. Treasury does this once (or periodically)
    ///         and can then inject rewards to any pool without further approvals.
    /// @dev Requires a one-time ERC-20 approval from the treasury wallet.
    function fundBonusPool(uint256 amount) external nonReentrant {
        require(msg.sender == treasury, "Only treasury");
        require(amount > 0, "Zero amount");
        saiko.safeTransferFrom(msg.sender, address(this), amount);
        treasuryBonusBalance += amount;
        emit TreasuryFunded(amount, treasuryBonusBalance);
    }

    /// @notice Inject a bonus reward to a specific pool's stakers from the pre-loaded balance.
    /// @dev No approval required — draws from treasuryBonusBalance funded via fundBonusPool.
    ///      Instantly distributes pro-rata to all currently-active notes in `_pool`.
    ///      Notes deposited after this call earn nothing from it.
    /// @param _pool  The pool address to reward
    /// @param amount Amount of SAIKO to distribute
    function injectPoolReward(address _pool, uint256 amount) external nonReentrant {
        require(msg.sender == treasury, "Only treasury");
        require(_pool != address(0), "Zero pool");
        require(amount > 0, "Zero amount");
        require(amount <= treasuryBonusBalance, "Insufficient bonus balance");
        uint256 staked = poolBonusTotalStaked[_pool];
        require(staked > 0, "No active stakers in pool");
        treasuryBonusBalance -= amount;
        poolBonusPerToken[_pool] += (amount * 1e18) / staked;
        totalPoolBonusReserve += amount;
        emit PoolRewardInjected(_pool, amount, staked);
    }

    /// @notice View accrued pool bonus for a note (not yet claimed)
    function earnedPoolBonus(bytes32 commitment) public view returns (uint256) {
        NoteInfo storage note = notes[commitment];
        if (note.sourcePool == address(0)) return notePoolBonus[commitment];
        return (note.amount * (poolBonusPerToken[note.sourcePool] - notePoolBonusPaid[commitment])) / 1e18
            + notePoolBonus[commitment];
    }

    // ── SAIKO rewards ─────────────────────────────────────────────────────────

    /// @notice Accrue a SAIKO fee reward and optionally register a new note
    function accrueReward(
        bytes32 commitment,
        bytes32 depositor,          // tx.origin / depositor address as bytes32 (for claimManual auth)
        uint256 noteAmount,
        uint256 feeAmount
    ) external override onlyAuthorised whenNotPaused {
        _updateSaikoState(bytes32(0));
        _updateEthState(bytes32(0));   // H-1 fix: snapshot ETH accumulator before new note enters
        rewardPool += feeAmount;
        saiko.safeTransferFrom(msg.sender, address(this), feeAmount);

        if (noteAmount > 0) {
            require(!notes[commitment].active, "Commitment exists"); // M-2 fix: defense-in-depth
            // Store the claim key hash so depositor can call claimManual later
            claimKeyHashes[commitment] = depositor;
            notes[commitment] = NoteInfo({
                amount: noteAmount,
                rewardPerTokenPaid: rewardPerTokenStored,
                rewards: 0,
                ethRewardPerTokenPaid: ethRewardPerTokenStored,
                ethRewards: 0,
                active: true,
                sourcePool: msg.sender
            });
            totalStaked += noteAmount;
            // Snapshot pool bonus accumulator at deposit time so note only earns future injections
            poolBonusTotalStaked[msg.sender] += noteAmount;
            notePoolBonusPaid[commitment] = poolBonusPerToken[msg.sender];
        }

        emit RewardAccrued(commitment, feeAmount, 0);
    }

    /// @notice Accrue ETH fee rewards into the ETH reward pool
    /// @dev Called by the router with msg.value = ETH staking share
    function accrueEthReward() external payable onlyAuthorised whenNotPaused {
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
    ) external override onlyAuthorised whenNotPaused nonReentrant returns (uint256 claimed) {
        _updateSaikoState(commitment);
        _updateEthState(commitment);
        _settlePoolBonus(commitment);
        NoteInfo storage note = notes[commitment];
        require(note.active, "Note not active"); // M-1 fix: guard against double-claim

        claimed = note.rewards;
        if (claimed > rewardPool) claimed = rewardPool;
        uint256 ethClaimed = note.ethRewards;
        if (ethClaimed > ethRewardPool) ethClaimed = ethRewardPool;
        uint256 bonusClaimed = notePoolBonus[commitment];
        if (bonusClaimed > totalPoolBonusReserve) bonusClaimed = totalPoolBonusReserve;

        note.rewards = 0;
        note.ethRewards = 0;
        notePoolBonus[commitment] = 0;
        note.active = false;
        totalStaked -= note.amount;
        poolBonusTotalStaked[note.sourcePool] -= note.amount;

        if (claimed > 0) {
            rewardPool -= claimed;
            saiko.safeTransfer(recipient, claimed);
        }
        if (ethClaimed > 0) {
            ethRewardPool -= ethClaimed;
            (bool ok,) = payable(recipient).call{value: ethClaimed}("");
            require(ok, "ETH transfer failed");
        }
        if (bonusClaimed > 0) {
            totalPoolBonusReserve -= bonusClaimed;
            saiko.safeTransfer(recipient, bonusClaimed);
        }

        emit RewardClaimed(recipient, claimed + bonusClaimed, ethClaimed);
    }

    // ── Claim: manual (without withdrawing) ───────────────────────────────────

    /// @notice Manually claim both SAIKO and ETH rewards for a note
    /// @dev Caller must provide the claimKeyPreimage whose keccak256 matches the stored claimKeyHash.
    /// @param commitment The deposit commitment hash
    /// @param claimKeyPreimage The preimage whose keccak256 matches the stored claim key hash
    /// @param recipient Address to receive rewards
    function claimManual(bytes32 commitment, bytes32 claimKeyPreimage, address recipient) external nonReentrant whenNotPaused {
        require(keccak256(abi.encodePacked(claimKeyPreimage)) == claimKeyHashes[commitment], "Invalid claim key");

        _updateSaikoState(commitment);
        _updateEthState(commitment);
        _settlePoolBonus(commitment);

        NoteInfo storage note = notes[commitment];
        require(note.active, "Note not active");

        uint256 saikoClaimed = note.rewards;
        if (saikoClaimed > rewardPool) saikoClaimed = rewardPool;
        uint256 ethClaimed = note.ethRewards;
        if (ethClaimed > ethRewardPool) ethClaimed = ethRewardPool;
        uint256 bonusClaimed = notePoolBonus[commitment];
        if (bonusClaimed > totalPoolBonusReserve) bonusClaimed = totalPoolBonusReserve;

        note.rewards = 0;
        note.ethRewards = 0;
        notePoolBonus[commitment] = 0;
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
        if (bonusClaimed > 0) {
            totalPoolBonusReserve -= bonusClaimed;
            saiko.safeTransfer(recipient, bonusClaimed);
        }

        emit RewardClaimed(recipient, saikoClaimed + bonusClaimed, ethClaimed);
    }

    // ── Deactivate orphaned notes ──────────────────────────────────────────

    /// @notice Deactivate a note without transferring rewards.
    /// @dev Called by the pool when a staking claimReward reverts (e.g. staking paused).
    ///      Prevents the note from staying active in totalStaked forever.
    function deactivateNote(bytes32 commitment) external onlyAuthorised {
        NoteInfo storage note = notes[commitment];
        if (!note.active) return;

        _updateSaikoState(commitment);
        _updateEthState(commitment);
        _settlePoolBonus(commitment);

        note.active = false;
        totalStaked -= note.amount;
        poolBonusTotalStaked[note.sourcePool] -= note.amount;
        note.rewards = 0;
        note.ethRewards = 0;
        // Re-route forfeited pool bonus back into global drip pool so remaining stakers benefit
        uint256 forfeitedBonus = notePoolBonus[commitment];
        if (forfeitedBonus > 0 && forfeitedBonus <= totalPoolBonusReserve) {
            totalPoolBonusReserve -= forfeitedBonus;
            rewardPool += forfeitedBonus;
        }
        notePoolBonus[commitment] = 0;
    }

    // ── Pausable ─────────────────────────────────────────────────────────────

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _settlePoolBonus(bytes32 commitment) internal {
        NoteInfo storage note = notes[commitment];
        if (note.sourcePool == address(0)) return;
        notePoolBonus[commitment] = earnedPoolBonus(commitment);
        notePoolBonusPaid[commitment] = poolBonusPerToken[note.sourcePool];
    }

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
