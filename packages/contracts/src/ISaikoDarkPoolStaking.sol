// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
}
