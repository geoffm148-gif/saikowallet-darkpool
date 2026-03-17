// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoPoolFactory
/// @author Saiko Wallet
/// @notice Factory for creating SaikoCustomPool liquidity pools.
///         Each token pair can only have one pool.

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./SaikoFeeConfig.sol";
import "./SaikoCustomPool.sol";
import "./ISaikoDarkPoolStaking.sol";

contract SaikoPoolFactory is Ownable2Step {
    SaikoFeeConfig public feeConfig;
    address public immutable staking;

    /// @notice Mapping from sorted token pair hash to pool address
    mapping(bytes32 => address) public pools;

    event PoolCreated(address indexed tokenA, address indexed tokenB, address pool, uint256 feeBPS);
    event FeeConfigUpdated(address oldConfig, address newConfig);
    event PoolFeeOverridden(address indexed pool, uint256 newFeeBPS);

    /// @param _feeConfig Address of the SaikoFeeConfig contract (also contains treasury)
    /// @param _staking Address of the staking contract
    constructor(address _feeConfig, address _staking) Ownable(msg.sender) {
        require(_feeConfig != address(0), "Zero feeConfig");
        require(_staking != address(0), "Zero staking");
        feeConfig = SaikoFeeConfig(_feeConfig);
        staking = _staking;
    }

    /// @notice Create a new liquidity pool for a token pair
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @param feeBPS Fee for the pool in basis points
    /// @return pool Address of the newly created pool
    function createPool(address tokenA, address tokenB, uint256 feeBPS) external returns (address pool) {
        require(tokenA != tokenB, "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "Zero token");
        require(feeBPS <= feeConfig.customPoolDefaultFeeBPS(), "Fee exceeds max");

        // Sort tokens
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        bytes32 pairKey = keccak256(abi.encodePacked(token0, token1));
        require(pools[pairKey] == address(0), "Pool exists");

        SaikoCustomPool newPool = new SaikoCustomPool(
            token0,
            token1,
            feeBPS,
            address(feeConfig),
            staking
        );
        pool = address(newPool);
        pools[pairKey] = pool;

        // Auto-authorise pool in staking so swaps work immediately without manual admin step
        ISaikoDarkPoolStaking(staking).authorizePool(pool);

        emit PoolCreated(token0, token1, pool, feeBPS);
    }

    /// @notice Get the pool address for a token pair
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @return pool Address of the pool (address(0) if none exists)
    function getPool(address tokenA, address tokenB) external view returns (address pool) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pool = pools[keccak256(abi.encodePacked(token0, token1))];
    }

    /// @notice Update the fee config contract address
    /// @param _feeConfig New fee config contract address
    function updateFeeConfig(address _feeConfig) external onlyOwner {
        require(_feeConfig != address(0), "Zero feeConfig");
        address old = address(feeConfig);
        feeConfig = SaikoFeeConfig(_feeConfig);
        emit FeeConfigUpdated(old, _feeConfig);
    }

    /// @notice Emergency admin override to change a pool's fee
    /// @param pool Address of the pool
    /// @param newFeeBPS New fee in basis points
    function setPoolFee(address pool, uint256 newFeeBPS) external onlyOwner {
        require(newFeeBPS <= feeConfig.MAX_CUSTOM_POOL_FEE_BPS(), "Fee exceeds absolute max");
        SaikoCustomPool(pool).setFee(newFeeBPS);
        emit PoolFeeOverridden(pool, newFeeBPS);
    }

    /// @notice Pause a custom pool (emergency)
    /// @param pool Address of the pool to pause
    function pausePool(address pool) external onlyOwner {
        SaikoCustomPool(pool).pause();
    }

    /// @notice Unpause a custom pool
    /// @param pool Address of the pool to unpause
    function unpausePool(address pool) external onlyOwner {
        SaikoCustomPool(pool).unpause();
    }
}
