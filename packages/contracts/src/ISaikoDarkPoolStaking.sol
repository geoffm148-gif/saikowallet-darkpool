// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ISaikoDarkPoolStaking
/// @notice Interface for the Saiko Dark Pool staking contract
interface ISaikoDarkPoolStaking {
    /// @notice Accrue staking rewards for a deposit commitment
    /// @param commitment The deposit commitment hash
    /// @param depositor The depositor address as bytes32 (for claimManual auth)
    /// @param noteAmount The note amount (deposit minus fee) to register as stake
    /// @param feeAmount The fee amount to add to the reward pool
    function accrueReward(bytes32 commitment, bytes32 depositor, uint256 noteAmount, uint256 feeAmount) external;

    /// @notice Claim accrued rewards and deactivate the note (called by pool on withdrawal)
    /// @param commitment The deposit commitment hash
    /// @param recipient The address to receive the rewards
    /// @return claimed The amount of rewards claimed
    function claimReward(bytes32 commitment, address recipient) external returns (uint256 claimed);

    /// @notice Deactivate a note without transferring rewards (called by pool on failed claim)
    /// @param commitment The deposit commitment hash
    function deactivateNote(bytes32 commitment) external;

    /// @notice Add tokens to the reward pool (provider share from custom pools)
    /// @param token The token being sent
    /// @param amount Amount of tokens to add
    function addToRewardPool(IERC20 token, uint256 amount) external;

    /// @notice Authorise a newly created custom pool to call accrueReward/addToRewardPool
    /// @dev Called by SaikoPoolFactory.createPool() immediately after pool deployment
    /// @param pool Address of the newly created pool
    function authorizePool(address pool) external;
}
