// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";
import "./MerkleTreeWithHistory.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals
    ) external view returns (bool);
}

contract SaikoDarkPoolV2 is MerkleTreeWithHistory, ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IGroth16Verifier public immutable verifier;
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
        uint256 fee,
        address indexed depositor
    );
    event Withdrawal(
        bytes32 indexed nullifierHash,
        address indexed recipient,
        uint256 amount
    );

    constructor(
        uint32 _levels,
        address _verifier,
        address _poseidonT3,
        address _saiko,
        address _treasury,
        address _staking
    ) MerkleTreeWithHistory(_levels, _poseidonT3) Ownable(msg.sender) {
        verifier = IGroth16Verifier(_verifier);
        saiko = IERC20(_saiko);
        treasury = _treasury;
        staking = ISaikoDarkPoolStaking(_staking);
    }

    function deposit(
        bytes32 commitment,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(commitmentAmount[commitment] == 0, "Commitment exists");
        require(_isValidTier(amount), "Invalid tier");

        saiko.safeTransferFrom(msg.sender, address(this), amount);

        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 stakingFee = (fee * REWARD_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = fee - stakingFee;
        uint256 noteAmount = amount - fee;

        saiko.safeTransfer(treasury, treasuryFee);
        saiko.forceApprove(address(staking), stakingFee);
        // Pass depositor address as bytes32 so staking contract can auth claimManual
        staking.accrueReward(commitment, bytes32(uint256(uint160(msg.sender))), noteAmount, stakingFee);

        commitmentAmount[commitment] = amount;
        tierBalance[amount] += noteAmount;

        uint32 leafIndex = _insert(commitment);

        emit Deposit(commitment, leafIndex, amount, noteAmount, fee, msg.sender);
    }

    function withdraw(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        bytes32 root,
        bytes32 nullifierHash,
        address recipient,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(isKnownRoot(root), "Unknown root");
        require(!nullifierSpent[nullifierHash], "Already spent");
        require(recipient != address(0), "Invalid recipient");
        require(_isValidTier(amount), "Invalid tier");

        uint256[4] memory pubSignals;
        pubSignals[0] = uint256(root);
        pubSignals[1] = uint256(nullifierHash);
        pubSignals[2] = uint256(uint160(recipient));
        pubSignals[3] = amount;

        require(
            verifier.verifyProof(pA, pB, pC, [pubSignals[0], pubSignals[1], pubSignals[2], pubSignals[3]]),
            "Invalid proof"
        );

        nullifierSpent[nullifierHash] = true;

        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 noteAmount = amount - fee;
        tierBalance[amount] -= noteAmount;

        saiko.safeTransfer(recipient, noteAmount);

        emit Withdrawal(nullifierHash, recipient, amount);
    }

    /// @notice Update the staking contract address (e.g. after staking upgrade)
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
