// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";
import "./MerkleTreeWithHistory.sol";

interface IGroth16VerifierV3 {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) external view returns (bool);
}

contract SaikoDarkPoolV3 is MerkleTreeWithHistory, ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IGroth16VerifierV3 public immutable verifier;
    IERC20 public immutable saiko;
    address public immutable treasury;
    ISaikoDarkPoolStaking public staking;

    uint256 public constant TIER_1 = 10_000_000e18;
    uint256 public constant TIER_2 = 100_000_000e18;
    uint256 public constant TIER_3 = 1_000_000_000e18;
    uint256 public constant TIER_4 = 10_000_000_000e18;

    uint256 public constant FEE_BPS = 50;
    uint256 public constant REWARD_SHARE_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    mapping(bytes32 => bool) public nullifierSpent;
    mapping(bytes32 => uint256) public commitmentAmount;
    mapping(uint256 => uint256) public tierBalance;

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

    constructor(
        uint32 _levels,
        address _verifier,
        address _poseidonT3,
        address _saiko,
        address _treasury,
        address _staking
    ) MerkleTreeWithHistory(_levels, _poseidonT3) Ownable(msg.sender) {
        verifier = IGroth16VerifierV3(_verifier);
        saiko = IERC20(_saiko);
        treasury = _treasury;
        staking = ISaikoDarkPoolStaking(_staking);
    }

    function deposit(
        bytes32 commitment,
        uint256 amount,
        bytes32 claimKeyHash
    ) external nonReentrant whenNotPaused {
        require(commitmentAmount[commitment] == 0, "Commitment exists");
        require(_isValidTier(amount), "Invalid tier");
        require(claimKeyHash != bytes32(0), "Invalid claim key hash");

        saiko.safeTransferFrom(msg.sender, address(this), amount);

        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 stakingFee = (fee * REWARD_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = fee - stakingFee;
        uint256 noteAmount = amount - fee;

        saiko.safeTransfer(treasury, treasuryFee);
        saiko.forceApprove(address(staking), stakingFee);
        staking.accrueReward(commitment, claimKeyHash, noteAmount, stakingFee);

        commitmentAmount[commitment] = amount;
        tierBalance[amount] += noteAmount;

        uint32 leafIndex = _insert(commitment);

        emit Deposit(commitment, leafIndex, amount, noteAmount, fee);
    }

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
        pubSignals[0] = uint256(commitment);      // circuit output — FIRST
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

        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 noteAmount = amount - fee;
        tierBalance[amount] -= noteAmount;

        // Claim staking rewards and deactivate note
        if (address(staking) != address(0)) {
            try staking.claimReward(commitment, recipient) {
                // success
            } catch (bytes memory reason) {
                emit StakingClaimFailed(commitment, recipient, reason);
            }
        }

        saiko.safeTransfer(recipient, noteAmount);

        emit Withdrawal(recipient, amount, fee);
    }

    function setStaking(address _staking) external onlyOwner {
        require(_staking != address(0), "Zero address");
        staking = ISaikoDarkPoolStaking(_staking);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _isValidTier(uint256 amount) internal pure returns (bool) {
        return amount == TIER_1 || amount == TIER_2 || amount == TIER_3 || amount == TIER_4;
    }
}
