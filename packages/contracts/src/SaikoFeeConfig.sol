// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title SaikoFeeConfig
/// @author Saiko Wallet
/// @notice Central source of truth for all fee parameters and the treasury address.
///         All parameters are adjustable by the owner. Fee caps are hardcoded constants
///         that can never be changed even by the owner.
contract SaikoFeeConfig is Ownable2Step {
    // ── Immutable caps (hardcoded — cannot be changed even by owner) ───────

    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint256 public constant MAX_SWAP_FEE_BPS        = 100;   // 1%
    uint256 public constant MAX_DARKPOOL_FEE_BPS    = 150;   // 1.5%
    uint256 public constant MAX_CUSTOM_POOL_FEE_BPS = 200;   // 2%

    // ── Adjustable fee parameters ──────────────────────────────────────────

    /// @notice Swap fee in basis points (default 50 = 0.5%)
    uint256 public swapFeeBPS = 50;

    /// @notice DarkPool fee in basis points (default 50 = 0.5%)
    uint256 public darkpoolFeeBPS = 50;

    /// @notice Default max fee for custom pools in basis points (default 100 = 1%)
    uint256 public customPoolDefaultFeeBPS = 100;

    /// @notice Saiko's cut of custom pool fees in basis points (default 5000 = 50%)
    ///         Range: 0–10000 (0%–100%)
    uint256 public saikoCustomCutBPS = 5000;

    /// @notice Provider (anon staker) share of Saiko revenue in basis points (default 1000 = 10%)
    ///         Range: 0–10000 (0%–100%)
    uint256 public providerShareBPS = 1000;

    /// @notice Treasury address — receives the protocol's share of all fees.
    ///         Updating this takes effect immediately on all contracts that reference this config.
    address payable public treasury;

    // ── Events ─────────────────────────────────────────────────────────────

    event SwapFeeUpdated(uint256 oldBps, uint256 newBps);
    event DarkPoolFeeUpdated(uint256 oldBps, uint256 newBps);
    event CustomPoolDefaultFeeUpdated(uint256 oldBps, uint256 newBps);
    event SaikoCustomCutUpdated(uint256 oldBps, uint256 newBps);
    event ProviderShareUpdated(uint256 oldBps, uint256 newBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ── Constructor ────────────────────────────────────────────────────────

    /// @param _treasury Initial treasury address
    constructor(address payable _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Zero treasury");
        treasury = _treasury;
    }

    // ── Setters ────────────────────────────────────────────────────────────

    /// @notice Set the swap fee. Max 1% (100 bps).
    function setSwapFee(uint256 bps) external onlyOwner {
        require(bps <= MAX_SWAP_FEE_BPS, "Exceeds max swap fee");
        emit SwapFeeUpdated(swapFeeBPS, bps);
        swapFeeBPS = bps;
    }

    /// @notice Set the DarkPool fee. Max 1.5% (150 bps).
    function setDarkPoolFee(uint256 bps) external onlyOwner {
        require(bps <= MAX_DARKPOOL_FEE_BPS, "Exceeds max darkpool fee");
        emit DarkPoolFeeUpdated(darkpoolFeeBPS, bps);
        darkpoolFeeBPS = bps;
    }

    /// @notice Set the default max fee for newly created custom pools. Max 2% (200 bps).
    function setCustomPoolDefaultFee(uint256 bps) external onlyOwner {
        require(bps <= MAX_CUSTOM_POOL_FEE_BPS, "Exceeds max custom pool fee");
        emit CustomPoolDefaultFeeUpdated(customPoolDefaultFeeBPS, bps);
        customPoolDefaultFeeBPS = bps;
    }

    /// @notice Set Saiko's cut of custom pool fees. Max 70% (7000 bps) — LPs always earn at least 30%.
    function setSaikoCustomCut(uint256 bps) external onlyOwner {
        require(bps <= 7000, "max 70%");
        emit SaikoCustomCutUpdated(saikoCustomCutBPS, bps);
        saikoCustomCutBPS = bps;
    }

    /// @notice Set the provider (anon staker) share of Saiko revenue. Range: 0%–100% (0–10000 bps).
    function setProviderShare(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Exceeds 100%");
        emit ProviderShareUpdated(providerShareBPS, bps);
        providerShareBPS = bps;
    }

    /// @notice Update the treasury address. Takes effect immediately for all contracts
    ///         that read treasury from this config.
    /// @param _treasury New treasury address (must be non-zero)
    function setTreasury(address payable _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }
}
