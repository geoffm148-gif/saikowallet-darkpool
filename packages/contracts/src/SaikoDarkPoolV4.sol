// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoDarkPoolV4
/// @author Saiko Wallet
/// @notice Updated DarkPool with adjustable fees read from SaikoFeeConfig.
///         Based on SaikoDarkPoolV3 with configurable fee parameters.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";
import "./MerkleTreeWithHistory.sol";
import "./SaikoFeeConfig.sol";

interface IGroth16VerifierV4 {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) external view returns (bool);
}

contract SaikoDarkPoolV4 is MerkleTreeWithHistory, ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IGroth16VerifierV4 public immutable verifier;
    IERC20 public immutable saiko;
    ISaikoDarkPoolStaking public staking;
    SaikoFeeConfig public feeConfig;

    uint256 public constant TIER_1 = 10_000_000e18;
    uint256 public constant TIER_2 = 100_000_000e18;
    uint256 public constant TIER_3 = 1_000_000_000e18;
    uint256 public constant TIER_4 = 10_000_000_000e18;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    mapping(bytes32 => bool) public nullifierSpent;
    mapping(bytes32 => uint256) public commitmentAmount;
    mapping(uint256 => uint256) public tierBalance;
    /// @notice The exact withdraw-able amount locked at deposit time.
    ///         Uses the fee that was actually charged — immune to fee config changes after deposit.
    mapping(bytes32 => uint256) public lockedNoteAmount;

    event Deposit(
        bytes32 indexed commitment,
        uint32 leafIndex,
        uint256 inputAmount,
        uint256 noteAmount,
        uint256 fee
    );
    event Withdrawal(
        address indexed recipient,
        uint256 amount,
        uint256 fee
    );
    event StakingClaimFailed(bytes32 indexed commitment, address indexed recipient, bytes reason);
    event FeeConfigUpdated(address oldConfig, address newConfig);
    event StakingUpdated(address oldStaking, address newStaking);

    /// @param _levels Merkle tree depth
    /// @param _verifier Address of the Groth16 verifier contract
    /// @param _poseidonT3 Address of the PoseidonT3 hasher contract
    /// @param _saiko Address of the SAIKO token
    /// @param _staking Address of the staking contract
    /// @param _feeConfig Address of the SaikoFeeConfig contract (also contains treasury)
    constructor(
        uint32 _levels,
        address _verifier,
        address _poseidonT3,
        address _saiko,
        address _staking,
        address _feeConfig
    ) MerkleTreeWithHistory(_levels, _poseidonT3) Ownable(msg.sender) {
        require(_verifier != address(0), "Zero verifier");
        require(_saiko != address(0), "Zero saiko");
        require(_staking != address(0), "Zero staking");
        require(_feeConfig != address(0), "Zero feeConfig");
        verifier = IGroth16VerifierV4(_verifier);
        saiko = IERC20(_saiko);
        staking = ISaikoDarkPoolStaking(_staking);
        feeConfig = SaikoFeeConfig(_feeConfig);
    }

    /// @notice Deposit SAIKO tokens into the dark pool
    /// @param commitment The deposit commitment hash
    /// @param amount The tier amount to deposit
    /// @param claimKeyHash Hash of the claim key for manual reward claiming
    function deposit(
        bytes32 commitment,
        uint256 amount,
        bytes32 claimKeyHash
    ) external nonReentrant whenNotPaused {
        require(commitmentAmount[commitment] == 0, "Commitment exists");
        require(_isValidTier(amount), "Invalid tier");
        require(claimKeyHash != bytes32(0), "Invalid claim key hash");

        saiko.safeTransferFrom(msg.sender, address(this), amount);

        uint256 feeBPS = feeConfig.darkpoolFeeBPS();
        uint256 providerBPS = feeConfig.providerShareBPS();

        uint256 fee = (amount * feeBPS) / BPS_DENOMINATOR;
        uint256 stakingFee = (fee * providerBPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = fee - stakingFee;
        uint256 noteAmount = amount - fee;

        if (treasuryFee > 0) saiko.safeTransfer(feeConfig.treasury(), treasuryFee);
        if (stakingFee > 0) {
            saiko.forceApprove(address(staking), stakingFee);
            staking.accrueReward(commitment, claimKeyHash, noteAmount, stakingFee);
        }

        commitmentAmount[commitment] = amount;
        lockedNoteAmount[commitment] = noteAmount; // fee locked at deposit — never recalculated
        tierBalance[amount] += noteAmount;

        uint32 leafIndex = _insert(commitment);

        emit Deposit(commitment, leafIndex, amount, noteAmount, fee);
    }

    /// @notice Withdraw tokens from the dark pool with a ZK proof
    /// @param pA Proof element A
    /// @param pB Proof element B
    /// @param pC Proof element C
    /// @param root Merkle root used in the proof
    /// @param nullifierHash Hash of the nullifier to prevent double spending
    /// @param recipient Address to receive the withdrawn tokens
    /// @param amount The tier amount being withdrawn
    /// @param commitment The commitment being withdrawn
    function withdraw(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        bytes32 root,
        bytes32 nullifierHash,
        address recipient,
        uint256 amount,
        bytes32 commitment
    ) external nonReentrant whenNotPaused {
        require(isKnownRoot(root), "Unknown root");
        require(!nullifierSpent[nullifierHash], "Already spent");
        require(recipient != address(0), "Invalid recipient");
        require(_isValidTier(amount), "Invalid tier");

        uint256[5] memory pubSignals;
        pubSignals[0] = uint256(commitment);
        pubSignals[1] = uint256(root);
        pubSignals[2] = uint256(nullifierHash);
        pubSignals[3] = uint256(uint160(recipient));
        pubSignals[4] = amount;

        require(
            verifier.verifyProof(pA, pB, pC, [pubSignals[0], pubSignals[1], pubSignals[2], pubSignals[3], pubSignals[4]]),
            "Invalid proof"
        );

        nullifierSpent[nullifierHash] = true;
        require(commitmentAmount[commitment] == amount, "Amount mismatch");

        // Use the note amount locked at deposit time — never recalculate from live fee.
        // This prevents fee changes after deposit from locking users out or stealing funds.
        uint256 noteAmount = lockedNoteAmount[commitment];
        require(noteAmount > 0, "Invalid note");
        uint256 fee = amount - noteAmount; // what was charged at deposit

        delete lockedNoteAmount[commitment];
        delete commitmentAmount[commitment];
        tierBalance[amount] -= noteAmount;

        // Claim staking rewards and deactivate note
        if (address(staking) != address(0)) {
            try staking.claimReward(commitment, recipient) {
                // success
            } catch (bytes memory reason) {
                // Deactivate the orphaned note so it doesn't stay in totalStaked forever
                try staking.deactivateNote(commitment) {} catch {}
                emit StakingClaimFailed(commitment, recipient, reason);
            }
        }

        saiko.safeTransfer(recipient, noteAmount);

        emit Withdrawal(recipient, amount, fee);
    }

    /// @notice Update the staking contract address
    /// @param _staking New staking contract address
    function setStaking(address _staking) external onlyOwner {
        require(_staking != address(0), "Zero address");
        address oldStaking = address(staking);
        staking = ISaikoDarkPoolStaking(_staking);
        emit StakingUpdated(oldStaking, _staking);
    }

    /// @notice Update the fee config contract address
    /// @param _feeConfig New fee config contract address
    function updateFeeConfig(address _feeConfig) external onlyOwner {
        require(_feeConfig != address(0), "Zero feeConfig");
        address old = address(feeConfig);
        feeConfig = SaikoFeeConfig(_feeConfig);
        emit FeeConfigUpdated(old, _feeConfig);
    }

    /// @notice Pause the contract (emergency)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Check if the amount corresponds to a valid deposit tier
    function _isValidTier(uint256 amount) internal pure returns (bool) {
        return amount == TIER_1 || amount == TIER_2 || amount == TIER_3 || amount == TIER_4;
    }
}
