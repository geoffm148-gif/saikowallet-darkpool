// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaikoCustomPool
/// @author Saiko Wallet
/// @notice Individual x*y=k AMM liquidity pool created by SaikoPoolFactory.
///         Fee is split between LPs, treasury, and staking providers.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SaikoFeeConfig.sol";
import "./ISaikoDarkPoolStaking.sol";

contract SaikoCustomPool is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Minimum liquidity locked on first deposit to prevent inflation attack
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    address public immutable factory;
    address public immutable staking;
    SaikoFeeConfig public immutable feeConfig;

    /// @notice Pool fee in basis points (set at creation, can be overridden by factory owner)
    uint256 public feeBPS;

    /// @notice Reserve of tokenA
    uint256 public reserveA;

    /// @notice Reserve of tokenB
    uint256 public reserveB;

    /// @notice Total LP shares outstanding
    uint256 public totalSupply;

    /// @notice LP share balances
    mapping(address => uint256) public balanceOf;

    // ── Events ─────────────────────────────────────────────────────────────

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 shares);
    event Swap(address indexed user, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, uint256 fee);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory");
        _;
    }

    /// @param _tokenA First token of the pair (sorted)
    /// @param _tokenB Second token of the pair (sorted)
    /// @param _feeBPS Pool fee in basis points
    /// @param _feeConfig Address of the SaikoFeeConfig contract (also contains treasury)
    /// @param _staking Address of the staking contract
    constructor(
        address _tokenA,
        address _tokenB,
        uint256 _feeBPS,
        address _feeConfig,
        address _staking
    ) {
        require(_tokenA != address(0) && _tokenB != address(0), "Zero token");
        require(_tokenA != _tokenB, "Identical tokens");
        require(_feeConfig != address(0), "Zero feeConfig");
        require(_staking != address(0), "Zero staking");
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        feeBPS = _feeBPS;
        feeConfig = SaikoFeeConfig(_feeConfig);
        staking = _staking;
        factory = msg.sender;
    }

    /// @notice Add liquidity to the pool
    /// @param amountA Amount of tokenA to add
    /// @param amountB Amount of tokenB to add
    /// @param minShares Minimum LP shares to receive (slippage protection)
    /// @param deadline Transaction deadline (reverts if block.timestamp > deadline)
    /// @return shares Number of LP shares minted
    function addLiquidity(uint256 amountA, uint256 amountB, uint256 minShares, uint256 deadline) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(block.timestamp <= deadline, "Deadline exceeded");
        require(amountA > 0 && amountB > 0, "Zero amounts");

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        if (totalSupply == 0) {
            // First deposit — use geometric mean, lock MINIMUM_LIQUIDITY
            shares = _sqrt(amountA * amountB);
            require(shares > MINIMUM_LIQUIDITY, "Insufficient initial liquidity");
            // Lock minimum liquidity to address(0) to prevent inflation attack
            totalSupply = MINIMUM_LIQUIDITY;
            balanceOf[address(0)] = MINIMUM_LIQUIDITY;
            shares -= MINIMUM_LIQUIDITY;
        } else {
            // Subsequent deposits — proportional to existing reserves
            uint256 sharesA = (amountA * totalSupply) / reserveA;
            uint256 sharesB = (amountB * totalSupply) / reserveB;
            shares = sharesA < sharesB ? sharesA : sharesB;
        }

        require(shares > 0, "Zero shares");
        require(shares >= minShares, "Insufficient shares");
        balanceOf[msg.sender] += shares;
        totalSupply += shares;
        reserveA += amountA;
        reserveB += amountB;

        emit LiquidityAdded(msg.sender, amountA, amountB, shares);
    }

    /// @notice Remove liquidity from the pool
    /// @param shares Number of LP shares to burn
    /// @param minAmountA Minimum tokenA to receive (slippage protection)
    /// @param minAmountB Minimum tokenB to receive (slippage protection)
    /// @param deadline Transaction deadline (reverts if block.timestamp > deadline)
    /// @return amountA Amount of tokenA returned
    /// @return amountB Amount of tokenB returned
    function removeLiquidity(uint256 shares, uint256 minAmountA, uint256 minAmountB, uint256 deadline) external nonReentrant returns (uint256 amountA, uint256 amountB) {
        require(block.timestamp <= deadline, "Deadline exceeded");
        require(shares > 0, "Zero shares");
        require(balanceOf[msg.sender] >= shares, "Insufficient shares");

        amountA = (shares * reserveA) / totalSupply;
        amountB = (shares * reserveB) / totalSupply;
        require(amountA > 0 && amountB > 0, "Insufficient liquidity burned");
        require(amountA >= minAmountA && amountB >= minAmountB, "Slippage exceeded");

        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;
        reserveA -= amountA;
        reserveB -= amountB;

        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, shares);
    }

    /// @notice Swap one token for the other
    /// @param tokenIn Address of the input token (must be tokenA or tokenB)
    /// @param amountIn Amount of input token
    /// @param minAmountOut Minimum output amount (slippage protection)
    /// @param deadline Transaction deadline (reverts if block.timestamp > deadline)
    /// @return amountOut Amount of output token received
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "Deadline exceeded");
        require(amountIn > 0, "Zero amountIn");
        require(tokenIn == address(tokenA) || tokenIn == address(tokenB), "Invalid tokenIn");
        require(reserveA > 0 && reserveB > 0, "No liquidity");

        bool isTokenA = tokenIn == address(tokenA);
        IERC20 inToken = isTokenA ? tokenA : tokenB;
        IERC20 outToken = isTokenA ? tokenB : tokenA;
        uint256 reserveIn = isTokenA ? reserveA : reserveB;
        uint256 reserveOut = isTokenA ? reserveB : reserveA;

        // Transfer input tokens
        inToken.safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate fee
        uint256 poolFee = (amountIn * feeBPS) / BPS_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - poolFee;

        // x*y=k swap calculation
        amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
        require(amountOut >= minAmountOut, "Slippage exceeded");
        require(amountOut > 0, "Zero output");

        // Fee distribution — inline, on every swap
        uint256 saikoCustomCut = feeConfig.saikoCustomCutBPS();
        uint256 saikoFee = (poolFee * saikoCustomCut) / BPS_DENOMINATOR;
        uint256 lpFee = poolFee - saikoFee;

        if (saikoFee > 0) {
            uint256 providerBPS = feeConfig.providerShareBPS();
            uint256 providerShare = (saikoFee * providerBPS) / BPS_DENOMINATOR;
            uint256 treasuryShare = saikoFee - providerShare;

            if (treasuryShare > 0) {
                inToken.safeTransfer(feeConfig.treasury(), treasuryShare);
            }
            if (providerShare > 0) {
                inToken.forceApprove(staking, providerShare);
                ISaikoDarkPoolStaking(staking).addToRewardPool(inToken, providerShare);
            }
        }

        // Update reserves: input increases by amountInAfterFee + lpFee, output decreases by amountOut
        if (isTokenA) {
            reserveA += amountInAfterFee + lpFee;
            reserveB -= amountOut;
        } else {
            reserveB += amountInAfterFee + lpFee;
            reserveA -= amountOut;
        }

        // Transfer output tokens
        outToken.safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, amountIn, address(outToken), amountOut, poolFee);
    }

    /// @notice Update pool fee (only callable by factory)
    /// @param newFeeBPS New fee in basis points
    function setFee(uint256 newFeeBPS) external onlyFactory {
        require(newFeeBPS <= 200, "Exceeds max fee"); // L-01: defence-in-depth, mirrors MAX_CUSTOM_POOL_FEE_BPS
        uint256 old = feeBPS;
        feeBPS = newFeeBPS;
        emit FeeUpdated(old, newFeeBPS);
    }

    /// @notice Pause the pool (only callable by factory)
    function pause() external onlyFactory { _pause(); }

    /// @notice Unpause the pool (only callable by factory)
    function unpause() external onlyFactory { _unpause(); }

    /// @dev Integer square root (Babylonian method)
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
