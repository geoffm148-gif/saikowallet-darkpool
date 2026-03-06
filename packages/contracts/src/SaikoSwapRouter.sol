// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoSwapRouter
/// @author Saiko Wallet
/// @notice Collects swap fees in both SAIKO and ETH, splitting each 90/10 between
///         the treasury and the staking reward pool.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ISaikoDarkPoolStaking.sol";

interface IStakingEth {
    function accrueEthReward() external payable;
}

contract SaikoSwapRouter is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable saiko;
    address payable public immutable treasury;
    ISaikoDarkPoolStaking public staking;

    uint256 public constant REWARD_SHARE_BPS = 1000;  // 10%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    mapping(address => bool) public authorisedCallers;

    modifier onlyAuthorised() {
        require(authorisedCallers[msg.sender], "Not authorised");
        _;
    }

    event FeeCollected(address indexed token, uint256 totalFee, uint256 stakingShare, uint256 treasuryShare);
    event EthFeeCollected(uint256 totalFee, uint256 stakingShare, uint256 treasuryShare);

    constructor(address _saiko, address payable _treasury, address _staking) Ownable(msg.sender) {
        saiko = IERC20(_saiko);
        treasury = _treasury;
        staking = ISaikoDarkPoolStaking(_staking);
    }

    function setAuthorisedCaller(address caller, bool status) external onlyOwner {
        authorisedCallers[caller] = status;
    }

    function updateStaking(address _staking) external onlyOwner {
        staking = ISaikoDarkPoolStaking(_staking);
    }

    /// @notice Collect a SAIKO swap fee — 90% treasury, 10% staking SAIKO pool
    function collectFee(uint256 feeAmount, bytes32 swapCommitment) external onlyAuthorised {
        saiko.safeTransferFrom(msg.sender, address(this), feeAmount);

        uint256 stakingShare = (feeAmount * REWARD_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryShare = feeAmount - stakingShare;

        saiko.safeTransfer(treasury, treasuryShare);

        if (stakingShare > 0 && swapCommitment != bytes32(0)) {
            saiko.forceApprove(address(staking), stakingShare);
            staking.accrueReward(swapCommitment, bytes32(0), 0, stakingShare);
        } else if (stakingShare > 0) {
            saiko.safeTransfer(treasury, stakingShare);
        }

        emit FeeCollected(address(saiko), feeAmount, stakingShare, treasuryShare);
    }

    /// @notice Collect an ETH swap fee — 90% treasury, 10% staking ETH pool
    /// @dev Call with msg.value = total ETH fee amount
    function collectEthFee() external payable onlyAuthorised {
        require(msg.value > 0, "No ETH fee");

        uint256 stakingShare = (msg.value * REWARD_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryShare = msg.value - stakingShare;

        // Send treasury share
        (bool ok,) = treasury.call{value: treasuryShare}("");
        require(ok, "Treasury transfer failed");

        // Send staking share to ETH reward pool
        if (stakingShare > 0) {
            IStakingEth(address(staking)).accrueEthReward{value: stakingShare}();
        }

        emit EthFeeCollected(msg.value, stakingShare, treasuryShare);
    }

    /// @notice Accept ETH (e.g. from unwrapped WETH during swaps)
    receive() external payable {}
}
