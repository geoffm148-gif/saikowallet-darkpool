// ── Contract Addresses ────────────────────────────────────────────────────────

export const SAIKO_TOKEN_ADDRESS = '0x4c89364F18Ecc562165820989549022e64eC2eD2' as const;
export const DARK_POOL_STAKING_ADDRESS = '0x67D3439e7AAC39B3c96b6eC38b3C06a39b4F98cC' as const;

// Active pools
export const DARK_POOL_V4_ADDRESS = '0x45aD0D2850BB4f44F6d59f0d16E1E13922f9e14C' as const;  // Live — deposits + withdrawals
export const DARK_POOL_V3_ADDRESS = '0x3Da6De018866b0f4c2b1D9Ef5D70be25597FDF53' as const;  // Legacy — withdrawals only
export const DARK_POOL_V2_ADDRESS = '0x6d985d3b7d57c3b6acd5c275f761be62b425915b' as const;  // Legacy — withdrawals only

export const FEE_CONFIG_ADDRESS = '0x571411670ABA6DD0cd663C3e6D3655f50e10695A' as const;
export const POOL_FACTORY_ADDRESS = '0x59CE8aDaAF9b92B39d23F17BFb74D353271A1CbD' as const;
export const SWAP_ROUTER_V2_ADDRESS = '0x4A1EAa497e2A083e54D3bab0EbB44466970fC73D' as const;

// Pool registry — shown in UI, ordered newest first
export const POOL_VERSIONS = [
  {
    version: 'V4' as const,
    address: DARK_POOL_V4_ADDRESS,
    label: 'DarkPool V4',
    status: 'active' as const,
    description: 'Deposits and withdrawals open. SAIKO + ETH staking rewards.',
  },
  {
    version: 'V3' as const,
    address: DARK_POOL_V3_ADDRESS,
    label: 'DarkPool V3',
    status: 'withdrawals_only' as const,
    description: 'Legacy pool. Existing notes can still be withdrawn.',
  },
  {
    version: 'V2' as const,
    address: DARK_POOL_V2_ADDRESS,
    label: 'DarkPool V2',
    status: 'withdrawals_only' as const,
    description: 'Legacy pool. Existing notes can still be withdrawn.',
  },
] as const;

export type PoolVersion = 'V2' | 'V3' | 'V4';
export type PoolStatus = 'active' | 'withdrawals_only';

// ── Tiers (raw, multiply by 1e18 for contract calls) ─────────────────────────

export const DARKPOOL_TIERS = [
  10_000_000n,
  100_000_000n,
  1_000_000_000n,
  10_000_000_000n,
] as const;

export const TIER_LABELS = ['10M SAIKO', '100M SAIKO', '1B SAIKO', '10B SAIKO'] as const;
export const TIER_AMOUNTS_WEI = DARKPOOL_TIERS.map(t => t * 10n ** 18n);

export const DARKPOOL_FEE_BPS = 50n; // 0.5%
export const BPS_DENOMINATOR = 10_000n;

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const DARK_POOL_V4_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimKeyHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pA', type: 'uint256[2]' },
      { name: 'pB', type: 'uint256[2][2]' },
      { name: 'pC', type: 'uint256[2]' },
      { name: 'root', type: 'bytes32' },
      { name: 'nullifierHash', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'commitment', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'getLastRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'isKnownRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'root', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'lockedNoteAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'nullifierSpent',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'nullifier', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'tierBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tier', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'nextIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint32' }],
  },
  {
    name: 'Deposit',
    type: 'event',
    inputs: [
      { name: 'commitment', type: 'bytes32', indexed: true },
      { name: 'leafIndex', type: 'uint32', indexed: false },
      { name: 'inputAmount', type: 'uint256', indexed: false },
      { name: 'noteAmount', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const STAKING_ABI = [
  {
    name: 'earned',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'earnedEth',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'claimManual',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'claimKeyPreimage', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'totalStaked',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'rewardPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const CUSTOM_POOL_ABI = [
  { name: 'tokenA',       type: 'function', stateMutability: 'view',        inputs: [],                                                                                       outputs: [{ type: 'address' }] },
  { name: 'tokenB',       type: 'function', stateMutability: 'view',        inputs: [],                                                                                       outputs: [{ type: 'address' }] },
  { name: 'reserveA',     type: 'function', stateMutability: 'view',        inputs: [],                                                                                       outputs: [{ type: 'uint256' }] },
  { name: 'reserveB',     type: 'function', stateMutability: 'view',        inputs: [],                                                                                       outputs: [{ type: 'uint256' }] },
  { name: 'totalSupply',  type: 'function', stateMutability: 'view',        inputs: [],                                                                                       outputs: [{ type: 'uint256' }] },
  { name: 'feeBPS',       type: 'function', stateMutability: 'view',        inputs: [],                                                                                       outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf',    type: 'function', stateMutability: 'view',        inputs: [{ name: 'account', type: 'address' }],                                                   outputs: [{ type: 'uint256' }] },
  { name: 'addLiquidity', type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'amountA', type: 'uint256' }, { name: 'amountB', type: 'uint256' }],             outputs: [{ name: 'shares', type: 'uint256' }] },
  { name: 'removeLiquidity', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }],                                                 outputs: [{ name: 'amountA', type: 'uint256' }, { name: 'amountB', type: 'uint256' }] },
  { name: 'swap',         type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'minAmountOut', type: 'uint256' }], outputs: [{ name: 'amountOut', type: 'uint256' }] },
] as const;

export const POOL_FACTORY_ABI = [
  { name: 'createPool', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }, { name: 'feeBPS', type: 'uint256' }], outputs: [{ name: 'pool', type: 'address' }] },
  { name: 'getPool',    type: 'function', stateMutability: 'view',       inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }],                  outputs: [{ name: 'pool', type: 'address' }] },
  { name: 'feeConfig',  type: 'function', stateMutability: 'view',       inputs: [],                                                                                           outputs: [{ name: '', type: 'address' }] },
] as const;

export const FEE_CONFIG_ABI = [
  { name: 'customPoolDefaultFeeBPS', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

// ── RPC ───────────────────────────────────────────────────────────────────────

export const RPC_URLS = [
  'https://ethereum.publicnode.com',
  'https://cloudflare-eth.com',
  'https://rpc.flashbots.net',
  'https://1rpc.io/eth',
] as const;
