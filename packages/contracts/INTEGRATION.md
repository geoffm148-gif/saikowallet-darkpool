# Saiko Protocol — Developer Integration Guide

> These contracts are deployed on Ethereum Mainnet and are immutable. Anyone can build interfaces,
> integrations, or tooling on top of them. This document covers everything you need.

---

## Contract Addresses

| Contract | Address |
|----------|---------|
| SaikoDarkPoolV4 | _to be updated post-deploy_ |
| SaikoDarkPoolStaking | _to be updated post-deploy_ |
| SaikoSwapRouterV2 | _to be updated post-deploy_ |
| SaikoPoolFactory | _to be updated post-deploy_ |
| SaikoFeeConfig | _to be updated post-deploy_ |
| SAIKO Token | `0x4c89364F18Ecc562165820989549022e64eC2eD2` |
| PoseidonT3 Hasher | `0x29Be4EFaC1FEd6CEce127e1CFcBf3C5596f4270a` |
| Groth16 Verifier | `0xB483068E623E0653bf73DdeaF9892C1d6E1F6E6C` |

ABI files for all contracts are in the `/abi/` directory alongside this document.

---

## Overview

Saiko is a ZK privacy protocol with three core components:

1. **SaikoDarkPoolV4** — ZK privacy pool. Deposit SAIKO, get an encrypted note. Withdraw to any address with a ZK proof — breaking the on-chain link between sender and receiver.
2. **SaikoDarkPoolStaking** — Staking rewards for DarkPool depositors. Earn SAIKO + ETH passively while your note sits in the pool.
3. **Custom Pools** (SaikoPoolFactory + SaikoCustomPool) — Create constant-product AMM pools for any ERC-20 pair. Fees flow to LPs, treasury, and stakers.

---

## Part 1 — DarkPool V4

### How it works

```
User generates a note (secret + nullifier)
    → Computes commitment = Poseidon(secret, nullifier)
    → Calls deposit(commitment, amount, claimKeyHash)
    → SAIKO transferred from user, commitment inserted into Merkle tree

Later (from any wallet, any address):
    → User generates ZK proof using the secret + nullifier
    → Calls withdraw(proof, root, nullifier, recipient, amount)
    → Contract verifies proof, sends SAIKO to recipient
    → Nullifier marked spent (prevents double-withdraw)
```

### Deposit tiers

Only fixed amounts can be deposited (for anonymity set integrity):

| Tier | Amount |
|------|--------|
| 0 | 10,000,000 SAIKO |
| 1 | 100,000,000 SAIKO |
| 2 | 1,000,000,000 SAIKO |
| 3 | 10,000,000,000 SAIKO |

### Generating a note (JavaScript)

```js
import { buildPoseidon } from 'circomlibjs';
import { randomBytes } from 'crypto';

async function generateNote(tier) {
  const poseidon = await buildPoseidon();

  // Generate random 31-byte values (fits in BN254 field)
  const secret    = randomBytes(31);
  const nullifier = randomBytes(31);

  // Compute commitment
  const commitment = poseidon([
    BigInt('0x' + secret.toString('hex')),
    BigInt('0x' + nullifier.toString('hex')),
  ]);

  return {
    secret,       // SAVE THIS — needed for withdrawal
    nullifier,    // SAVE THIS — needed for withdrawal
    commitment: poseidon.F.toString(commitment),
    tier,
  };
}
```

> **⚠️ Critical:** Save `secret` and `nullifier`. If lost, funds cannot be recovered. There is no admin recovery.

### Deposit (ethers.js)

```js
import { ethers } from 'ethers';
import darkpoolAbi from './abi/SaikoDarkPoolV4.json';
import saikoAbi from './abi/erc20.json'; // standard ERC-20

const SAIKO = '0x4c89364F18Ecc562165820989549022e64eC2eD2';
const DARKPOOL = '<DARKPOOL_V4_ADDRESS>';

async function deposit(signer, note) {
  const saiko   = new ethers.Contract(SAIKO, saikoAbi, signer);
  const pool    = new ethers.Contract(DARKPOOL, darkpoolAbi, signer);

  const tiers   = [10_000_000n, 100_000_000n, 1_000_000_000n, 10_000_000_000n];
  const amount  = ethers.parseEther(tiers[note.tier].toString());

  // 1. Approve SAIKO transfer
  await saiko.approve(DARKPOOL, amount);

  // 2. Generate a claimKeyHash — keccak256 of a secret for manual reward claims
  const claimSecret = ethers.randomBytes(32);
  const claimKeyHash = ethers.keccak256(claimSecret);
  // SAVE claimSecret alongside your note

  // 3. Deposit
  const tx = await pool.deposit(
    ethers.toBeHex(note.commitment, 32), // commitment as bytes32
    amount,
    claimKeyHash,
  );
  await tx.wait();
  return { txHash: tx.hash, claimSecret };
}
```

### Generating a ZK withdrawal proof

ZK proof generation runs client-side using [snarkjs](https://github.com/iden3/snarkjs). You need:
- `withdrawal.wasm` — circuit compiled artifact
- `withdrawal_final.zkey` — trusted setup proving key

These files are available in the [Saiko GitHub repository](https://github.com/saiko-wallet/saiko-wallet) under `packages/wallet-core/src/darkpool/circuits/`.

```js
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

async function generateProof(note, merkleProof, recipient) {
  const poseidon = await buildPoseidon();

  // Recompute the nullifier hash (what gets stored on-chain to prevent double-spend)
  const nullifierHash = poseidon([
    BigInt('0x' + note.nullifier.toString('hex')),
    0n,
  ]);

  const input = {
    // Private inputs (never leave the client)
    secret:     BigInt('0x' + note.secret.toString('hex')).toString(),
    nullifier:  BigInt('0x' + note.nullifier.toString('hex')).toString(),
    pathElements: merkleProof.pathElements.map(String),
    pathIndices:  merkleProof.pathIndices.map(String),

    // Public inputs
    root:         merkleProof.root.toString(),
    nullifierHash: poseidon.F.toString(nullifierHash),
    recipient:    BigInt(recipient).toString(),
    amount:       note.amount.toString(),
    commitment:   note.commitment.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    'withdrawal.wasm',
    'withdrawal_final.zkey',
  );

  // Format for on-chain call
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const parsed   = JSON.parse('[' + calldata + ']');

  return {
    pA:           parsed[0],
    pB:           parsed[1],
    pC:           parsed[2],
    pubSignals:   parsed[3],
    root:         merkleProof.root,
    nullifierHash: poseidon.F.toString(nullifierHash),
  };
}
```

### Getting the Merkle proof

You need to reconstruct the Merkle tree from on-chain events to generate a proof.

```js
// Fetch all past Deposit events to reconstruct the tree
const pool = new ethers.Contract(DARKPOOL, darkpoolAbi, provider);
const filter = pool.filters.Deposit();
const events = await pool.queryFilter(filter, 0, 'latest');

// Tree has depth 20 — use a Merkle tree library compatible with Poseidon
// The insertion order matches event order
const leaves = events.map(e => e.args.commitment);
// Build tree using the same Poseidon hasher and extract proof for your leaf
```

> The Saiko wallet-core package exports `buildMerkleProof(leaves, commitment)` — you can use this directly if building with the monorepo.

### Withdraw

```js
async function withdraw(signer, proofData, recipient) {
  const pool = new ethers.Contract(DARKPOOL, darkpoolAbi, signer);

  const tx = await pool.withdraw(
    proofData.pA,
    proofData.pB,
    proofData.pC,
    proofData.root,
    proofData.nullifierHash,
    recipient,
    proofData.pubSignals[4], // amount
    proofData.pubSignals[0], // commitment
  );
  await tx.wait();
  return tx.hash;
}
```

### Events

```solidity
event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
event Withdrawal(address indexed recipient, bytes32 nullifierHash, uint256 amount, uint256 fee);
```

---

## Part 2 — Staking Rewards

Depositors automatically earn SAIKO + ETH rewards for every block their note is in the pool. Rewards are claimed when withdrawing, or manually at any time.

### Claim rewards without withdrawing (claimManual)

```js
import stakingAbi from './abi/SaikoDarkPoolStaking.json';

async function claimRewardsManually(signer, commitment, claimSecret, recipient) {
  const staking = new ethers.Contract(STAKING, stakingAbi, signer);

  // claimSecret is the bytes32 value you saved at deposit time
  const tx = await staking.claimManual(
    commitment,   // bytes32 — the deposit commitment
    claimSecret,  // bytes32 — preimage of the claimKeyHash stored at deposit
    recipient,    // address to receive rewards
  );
  await tx.wait();
  return tx.hash;
}
```

> **Privacy note:** `claimSecret` is visible in the mempool when submitted. For maximum privacy, submit via [Flashbots](https://docs.flashbots.net/) or a private mempool to prevent front-running.

### Check pending rewards

```js
async function getPendingRewards(provider, commitment) {
  const staking = new ethers.Contract(STAKING, stakingAbi, provider);

  const [saikoRewards, ethRewards, poolBonus] = await Promise.all([
    staking.earned(commitment),
    staking.earnedEth(commitment),
    staking.earnedPoolBonus(commitment),
  ]);

  return {
    saiko: ethers.formatEther(saikoRewards + poolBonus),
    eth:   ethers.formatEther(ethRewards),
  };
}
```

### Events

```solidity
event RewardAccrued(bytes32 indexed commitment, uint256 saikoAmount, uint256 ethAmount);
event RewardClaimed(address indexed recipient, uint256 saikoAmount, uint256 ethAmount);
event PoolRewardInjected(address indexed pool, uint256 amount, uint256 activeStake);
```

---

## Part 3 — Custom Pools

Anyone can create a constant-product AMM pool for any two ERC-20 tokens. Pool creators set the fee (up to 2%). A portion of fees goes to LPs, with a cut flowing to SAIKO stakers.

### Create a pool

```js
import factoryAbi from './abi/SaikoPoolFactory.json';

async function createPool(signer, tokenA, tokenB, feeBPS) {
  // feeBPS: 1-200 (0.01% to 2%)
  const factory = new ethers.Contract(FACTORY, factoryAbi, signer);

  const tx = await factory.createPool(tokenA, tokenB, feeBPS);
  const receipt = await tx.wait();

  // Get pool address from event
  const event = receipt.logs
    .map(log => { try { return factory.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === 'PoolCreated');

  return event?.args.pool;
}
```

### Find existing pool

```js
async function getPool(provider, tokenA, tokenB) {
  const factory = new ethers.Contract(FACTORY, factoryAbi, provider);
  const poolAddress = await factory.getPool(tokenA, tokenB);
  if (poolAddress === ethers.ZeroAddress) return null;
  return poolAddress;
}
```

### Add liquidity

```js
import poolAbi from './abi/SaikoCustomPool.json';
import erc20Abi from './abi/erc20.json';

async function addLiquidity(signer, poolAddress, amountA, amountB, minShares) {
  const pool   = new ethers.Contract(poolAddress, poolAbi, signer);
  const tokenA = await pool.tokenA();
  const tokenB = await pool.tokenB();

  // Approve both tokens
  await new ethers.Contract(tokenA, erc20Abi, signer).approve(poolAddress, amountA);
  await new ethers.Contract(tokenB, erc20Abi, signer).approve(poolAddress, amountB);

  const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 min
  const tx = await pool.addLiquidity(amountA, amountB, minShares, deadline);
  await tx.wait();
  return tx.hash;
}
```

### Remove liquidity

```js
async function removeLiquidity(signer, poolAddress, shares, minAmountA, minAmountB) {
  const pool = new ethers.Contract(poolAddress, poolAbi, signer);
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  const tx = await pool.removeLiquidity(shares, minAmountA, minAmountB, deadline);
  await tx.wait();
  return tx.hash;
}
```

### Swap

```js
async function swap(signer, poolAddress, tokenIn, amountIn, minAmountOut) {
  const pool    = new ethers.Contract(poolAddress, poolAbi, signer);
  const tokenInContract = new ethers.Contract(tokenIn, erc20Abi, signer);

  await tokenInContract.approve(poolAddress, amountIn);

  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const tx = await pool.swap(tokenIn, amountIn, minAmountOut, deadline);
  await tx.wait();
  return tx.hash;
}
```

### Get quote (read-only, no gas)

```js
async function getSwapQuote(provider, poolAddress, tokenIn, amountIn) {
  const pool = new ethers.Contract(poolAddress, poolAbi, provider);

  const [reserveA, reserveB, tokenA, feeBPS] = await Promise.all([
    pool.reserveA(),
    pool.reserveB(),
    pool.tokenA(),
    pool.feeBPS(),
  ]);

  const isTokenA = tokenIn.toLowerCase() === tokenA.toLowerCase();
  const reserveIn  = isTokenA ? reserveA : reserveB;
  const reserveOut = isTokenA ? reserveB : reserveA;

  const fee       = (amountIn * feeBPS) / 10000n;
  const amountInAfterFee = amountIn - fee;
  const amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);

  const priceImpact = Number((amountIn * 10000n) / (reserveIn + amountIn)) / 100;

  return { amountOut, fee, priceImpact };
}
```

### Events

```solidity
event PoolCreated(address indexed tokenA, address indexed tokenB, address pool, uint256 feeBPS);
event Swap(address indexed tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee, address indexed recipient);
event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 shares);
event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 shares);
```

---

## Part 4 — Fee Configuration

Read current protocol fees from SaikoFeeConfig. These can change, so always read them on-chain rather than hardcoding.

```js
import feeConfigAbi from './abi/SaikoFeeConfig.json';

async function getFees(provider) {
  const feeConfig = new ethers.Contract(FEE_CONFIG, feeConfigAbi, provider);

  const [darkpoolFeeBPS, swapFeeBPS, saikoCustomCutBPS, providerShareBPS, treasury] = await Promise.all([
    feeConfig.darkpoolFeeBPS(),       // DarkPool deposit fee (BPS)
    feeConfig.swapFeeBPS(),           // Router swap fee (BPS)
    feeConfig.saikoCustomCutBPS(),    // Saiko's cut of custom pool fees (BPS)
    feeConfig.providerShareBPS(),     // LP provider's share of Saiko's cut (BPS)
    feeConfig.treasury(),             // Treasury address
  ]);

  return {
    darkpoolFee:    Number(darkpoolFeeBPS) / 100 + '%',
    swapFee:        Number(swapFeeBPS) / 100 + '%',
    saikoCustomCut: Number(saikoCustomCutBPS) / 100 + '%',
    providerShare:  Number(providerShareBPS) / 100 + '%',
    treasury,
  };
}
```

---

## Part 5 — Indexing & Subgraph

If you're building a data layer, index these events:

| Contract | Event | Purpose |
|----------|-------|---------|
| SaikoDarkPoolV4 | `Deposit(commitment, leafIndex, timestamp)` | Track pool deposits, build Merkle tree |
| SaikoDarkPoolV4 | `Withdrawal(recipient, nullifierHash, amount, fee)` | Track withdrawals |
| SaikoDarkPoolStaking | `RewardAccrued(commitment, saiko, eth)` | Track reward accrual |
| SaikoDarkPoolStaking | `RewardClaimed(recipient, saiko, eth)` | Track claims |
| SaikoDarkPoolStaking | `PoolRewardInjected(pool, amount, stake)` | Track bonus injections |
| SaikoPoolFactory | `PoolCreated(tokenA, tokenB, pool, feeBPS)` | Track new pools |
| SaikoCustomPool | `Swap(tokenIn, amountIn, amountOut, fee, recipient)` | Track swap volume |
| SaikoCustomPool | `LiquidityAdded(provider, amountA, amountB, shares)` | Track TVL |
| SaikoCustomPool | `LiquidityRemoved(provider, amountA, amountB, shares)` | Track TVL |

---

## Part 6 — Security Considerations

- **ZK proofs run client-side.** Never send `secret` or `nullifier` to any server.
- **Save your note.** Losing `secret` or `nullifier` means permanent loss of funds.
- **claimManual privacy.** The `claimSecret` preimage is visible in the mempool. Use Flashbots for maximum privacy.
- **Price impact.** Always check price impact before swapping. Large trades in thin pools can result in significant slippage.
- **Tier sizes.** Depositing off-tier amounts is rejected by the contract.
- **Deadline.** Always set a realistic deadline on pool operations (20 minutes is standard).
- **minShares / minAmounts.** Always set slippage protection — never pass 0 in production.

---

## Part 7 — Quick Reference: Key Function Signatures

```solidity
// SaikoDarkPoolV4
function deposit(bytes32 commitment, uint256 amount, bytes32 claimKeyHash) external
function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, uint256 amount, bytes32 commitment) external
function isKnownRoot(bytes32 root) external view returns (bool)
function commitmentAmount(bytes32 commitment) external view returns (uint256)
function nullifierSpent(bytes32 nullifier) external view returns (bool)

// SaikoDarkPoolStaking
function earned(bytes32 commitment) external view returns (uint256)
function earnedEth(bytes32 commitment) external view returns (uint256)
function earnedPoolBonus(bytes32 commitment) external view returns (uint256)
function claimManual(bytes32 commitment, bytes32 claimKeyPreimage, address recipient) external
function totalStaked() external view returns (uint256)

// SaikoPoolFactory
function createPool(address tokenA, address tokenB, uint256 feeBPS) external returns (address pool)
function getPool(address tokenA, address tokenB) external view returns (address)

// SaikoCustomPool
function addLiquidity(uint256 amountA, uint256 amountB, uint256 minShares, uint256 deadline) external returns (uint256 shares)
function removeLiquidity(uint256 shares, uint256 minAmountA, uint256 minAmountB, uint256 deadline) external returns (uint256 amountA, uint256 amountB)
function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external returns (uint256 amountOut)
function reserveA() external view returns (uint256)
function reserveB() external view returns (uint256)
function totalSupply() external view returns (uint256)
function balanceOf(address) external view returns (uint256)
```

---

## Resources

- ABI files: `/abi/` directory in this repository
- Circuit files: `packages/wallet-core/src/darkpool/circuits/`
- Reference implementation (Saiko Wallet): https://github.com/saiko-wallet/saiko-wallet
- snarkjs: https://github.com/iden3/snarkjs
- circomlibjs: https://github.com/iden3/circomlibjs
- Flashbots (private mempool): https://docs.flashbots.net/

---

*Saiko Protocol is open infrastructure. The contracts are deployed, immutable, and belong to no one. Build freely.*
