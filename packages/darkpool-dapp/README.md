# Saiko DarkPool Dapp

Standalone frontend for the Saiko privacy pool. Zero knowledge. Zero trace.

## Setup

```bash
npm install
npm run dev
```

## Circuit Files

Before building for production, copy the ZK circuit files into `public/circuits/`:

```
public/circuits/
  withdrawal_js/
    withdrawal.wasm
  withdrawal_final.zkey
  verification_key.json
```

These are in `packages/wallet-core/src/darkpool/circuits/` in the monorepo.

## Contract Addresses

After deploying V4 contracts, update `src/constants.ts`:
- `DARK_POOL_V4_ADDRESS`
- `FEE_CONFIG_ADDRESS`

## Hosting (Iceland)

Build: `npm run build`
Output: `dist/`

Deploy to any static host — recommended: 1984 Hosting (Iceland) or Njord.
For censorship resistance: also pin to IPFS and set an ENS contenthash.

## Flashbots for claimManual

The claim key preimage is visible in the mempool.
Users should submit `claimManual` transactions via Flashbots Protect RPC:
`https://rpc.flashbots.net`

## Brand

- Background: #0A0A0A
- Accent: #E31B23
- Font: Anton (headlines), Arial (body)
- No gradients. No rounded corners. Dark and aggressive.
