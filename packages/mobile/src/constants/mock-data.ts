export const MOCK_WALLET = {
  address: '0x4c89364F18Ecc562165820989549022e64eC2eD2',
  saikoBalance: '8,420,000,000',
  ethBalance: '1.337',
  saikoUsdPrice: 0.000000847,
  saikoUsdValue: '$7,131.54',
  ethUsdPrice: 3241.0,
  ethUsdValue: '$4,333.42',
};

export const MOCK_TRANSACTIONS = [
  {
    hash: '0xabc...def1',
    type: 'receive' as const,
    amount: '500,000,000',
    symbol: 'SAIKO',
    from: '0x1234...5678',
    time: '2h ago',
  },
  {
    hash: '0xabc...def2',
    type: 'send' as const,
    amount: '100,000,000',
    symbol: 'SAIKO',
    to: '0x8765...4321',
    time: '1d ago',
  },
  {
    hash: '0xabc...def3',
    type: 'swap' as const,
    amount: '0.05',
    symbol: 'ETH',
    time: '3d ago',
  },
];

export const MOCK_DARK_POOL_NOTES = [
  {
    id: 'note1',
    tier: '10B',
    amount: '10,000,000,000',
    earnedSaiko: '42,000,000',
    earnedEth: '0.0412',
    stakedDays: 12,
  },
  {
    id: 'note2',
    tier: '1B',
    amount: '1,000,000,000',
    earnedSaiko: '3,800,000',
    earnedEth: '0.0038',
    stakedDays: 5,
  },
];
