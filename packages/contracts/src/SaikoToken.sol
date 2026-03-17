// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoToken
/// @author Saiko Wallet
/// @notice The SAIKO ERC20 governance token with a fixed supply of 1 trillion tokens.
///         Supports EIP-2612 gasless approvals (Permit), on-chain vote delegation (ERC20Votes),
///         and voluntary burning. Ownership can be renounced after deployment.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

contract SaikoToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes, Ownable2Step {
    /// @notice Maximum and total supply: 1 trillion SAIKO (18 decimals)
    uint256 public constant MAX_SUPPLY = 1_000_000_000_000e18;

    /// @notice Deploy the SAIKO token and mint the entire supply to the initial recipient
    /// @param _initialRecipient The address that receives the full token supply at deployment
    constructor(address _initialRecipient)
        ERC20("Saiko", "SAIKO")
        ERC20Permit("Saiko")
        Ownable(msg.sender)
    {
        _mint(_initialRecipient, MAX_SUPPLY);
    }

    /// @notice Hook called on every transfer, mint, and burn to update vote checkpoints
    /// @param from The sender address (address(0) for mints)
    /// @param to The recipient address (address(0) for burns)
    /// @param value The amount being transferred
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    /// @notice Returns the current nonce for an address (used by EIP-2612 Permit)
    /// @param _owner The address to query
    /// @return The current nonce
    function nonces(address _owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(_owner);
    }
}
