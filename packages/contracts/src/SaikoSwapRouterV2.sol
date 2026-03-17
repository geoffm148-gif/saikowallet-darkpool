// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoSwapRouterV2
/// @author Saiko Wallet
/// @notice Drop-in replacement for SaikoSwapRouter. Reads fee params from SaikoFeeConfig
///         instead of using hardcoded constants.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./ISaikoDarkPoolStaking.sol";
import "./SaikoFeeConfig.sol";

interface IStakingEthV2 {
    function accrueEthReward() external payable;
}

contract SaikoSwapRouterV2 is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable saiko;
    ISaikoDarkPoolStaking public staking;
    SaikoFeeConfig public feeConfig;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    mapping(address => bool) public authorisedCallers;

    modifier onlyAuthorised() {
        require(authorisedCallers[msg.sender], "Not authorised");
        _;
    }

    event FeeCollected(address indexed token, uint256 totalFee, uint256 stakingShare, uint256 treasuryShare);
    event EthFeeCollected(uint256 totalFee, uint256 stakingShare, uint256 treasuryShare);
    event FeeConfigUpdated(address oldConfig, address newConfig);

    /// @param _feeConfig Address of the SaikoFeeConfig contract (also contains treasury address)
    /// @param _saiko Address of the SAIKO token
    /// @param _staking Address of the staking contract (receives provider share)
    constructor(
        address _feeConfig,
        address _saiko,
        address _staking
    ) Ownable(msg.sender) {
        require(_feeConfig != address(0), "Zero feeConfig");
        require(_saiko != address(0), "Zero saiko");
        require(_staking != address(0), "Zero staking");
        feeConfig = SaikoFeeConfig(_feeConfig);
        saiko = IERC20(_saiko);
        staking = ISaikoDarkPoolStaking(_staking);
    }

    /// @notice Set an address as an authorised caller (or revoke)
    function setAuthorisedCaller(address caller, bool status) external onlyOwner {
        authorisedCallers[caller] = status;
    }

    /// @notice Update the staking contract address
    function updateStaking(address _staking) external onlyOwner {
        require(_staking != address(0), "Zero staking");
        staking = ISaikoDarkPoolStaking(_staking);
    }

    /// @notice Update the fee config contract address
    function updateFeeConfig(address _feeConfig) external onlyOwner {
        require(_feeConfig != address(0), "Zero feeConfig");
        address old = address(feeConfig);
        feeConfig = SaikoFeeConfig(_feeConfig);
        emit FeeConfigUpdated(old, _feeConfig);
    }

    /// @notice Collect a SAIKO swap fee — split between treasury and staking per feeConfig
    /// @param feeAmount The total fee amount in SAIKO tokens
    /// @param swapCommitment The commitment hash for staking reward attribution
    function collectFee(uint256 feeAmount, bytes32 swapCommitment) external nonReentrant onlyAuthorised whenNotPaused {
        saiko.safeTransferFrom(msg.sender, address(this), feeAmount);

        uint256 providerBPS = feeConfig.providerShareBPS();
        uint256 stakingShare = (feeAmount * providerBPS) / BPS_DENOMINATOR;
        uint256 treasuryShare = feeAmount - stakingShare;

        address payable _treasury = feeConfig.treasury();
        if (treasuryShare > 0) {
            saiko.safeTransfer(_treasury, treasuryShare);
        }

        if (stakingShare > 0 && swapCommitment != bytes32(0)) {
            saiko.forceApprove(address(staking), stakingShare);
            staking.accrueReward(swapCommitment, bytes32(0), 0, stakingShare);
        } else if (stakingShare > 0) {
            saiko.safeTransfer(_treasury, stakingShare);
        }

        emit FeeCollected(address(saiko), feeAmount, stakingShare, treasuryShare);
    }

    /// @notice Collect an ETH swap fee — split between treasury and staking per feeConfig
    /// @dev Call with msg.value = total ETH fee amount
    function collectEthFee() external payable nonReentrant onlyAuthorised whenNotPaused {
        require(msg.value > 0, "No ETH fee");

        uint256 providerBPS = feeConfig.providerShareBPS();
        uint256 stakingShare = (msg.value * providerBPS) / BPS_DENOMINATOR;
        uint256 treasuryShare = msg.value - stakingShare;

        if (treasuryShare > 0) {
            (bool ok,) = feeConfig.treasury().call{value: treasuryShare}("");
            require(ok, "Treasury transfer failed");
        }

        if (stakingShare > 0) {
            IStakingEthV2(address(staking)).accrueEthReward{value: stakingShare}();
        }

        emit EthFeeCollected(msg.value, stakingShare, treasuryShare);
    }

    /// @notice Pause the router (emergency)
    function pause() external onlyOwner { _pause(); }

    /// @notice Unpause the router
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Rescue ERC-20 tokens accidentally sent to this contract
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Rescue ETH accidentally sent to this contract
    /// @dev Only recovers ETH above the tracked reward balance (none is currently tracked here)
    function rescueETH(address payable to) external onlyOwner {
        require(to != address(0), "Zero recipient");
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "ETH rescue failed");
    }

    /// @notice Accept ETH (e.g. from unwrapped WETH during swaps)
    receive() external payable {}
}
