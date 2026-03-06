/**
 * Diagnostic: compare our JS Merkle tree root vs on-chain getLastRoot()
 */
import https from 'https';
import { keccak256, toUtf8Bytes } from 'ethers';

const DARK_POOL = '0x6d985d3b7d57c3b6acd5c275f761be62b425915b';
const RPC = 'https://ethereum.publicnode.com';
const DEPLOY_BLOCK = 24_594_587;
const CHUNK_SIZE = 49_000;

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const req = https.request(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.error) reject(new Error(json.error.message));
        else resolve(json.result);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Fetch on-chain last root
  const getLastRootSel = '0x' + keccak256(toUtf8Bytes('getLastRoot()')).slice(2, 10);
  const nextIndexSel   = '0x' + keccak256(toUtf8Bytes('nextIndex()')).slice(2, 10);
  const levelsRootSel  = '0x' + keccak256(toUtf8Bytes('levels()')).slice(2, 10);

  const [onChainRootHex, nextIndexHex, levelsHex] = await Promise.all([
    rpc('eth_call', [{ to: DARK_POOL, data: getLastRootSel }, 'latest']),
    rpc('eth_call', [{ to: DARK_POOL, data: nextIndexSel },   'latest']),
    rpc('eth_call', [{ to: DARK_POOL, data: levelsRootSel },  'latest']),
  ]);

  const onChainRoot = BigInt(onChainRootHex);
  const nextIndex   = Number(BigInt(nextIndexHex));
  const levels      = Number(BigInt(levelsHex));
  console.log(`On-chain getLastRoot(): 0x${onChainRoot.toString(16).padStart(64,'0')}`);
  console.log(`On-chain nextIndex:     ${nextIndex}`);
  console.log(`On-chain levels:        ${levels}`);

  // 2. Fetch all deposit events
  const depositTopic = keccak256(toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256,address)'));
  const latestHex = await rpc('eth_blockNumber', []);
  const latest = Number(BigInt(latestHex));

  const allLogs = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, latest);
    const chunk = await rpc('eth_getLogs', [{
      address: DARK_POOL,
      topics: [depositTopic],
      fromBlock: '0x' + from.toString(16),
      toBlock:   '0x' + to.toString(16),
    }]);
    if (Array.isArray(chunk)) allLogs.push(...chunk);
  }

  const commitments = allLogs.map(log => BigInt(log.topics[1]));
  console.log(`\nFetched ${commitments.length} deposits (nextIndex=${nextIndex})`);
  commitments.forEach((c, i) => console.log(`  [${i}] 0x${c.toString(16).padStart(64,'0')}`));

  if (commitments.length !== nextIndex) {
    console.error(`\n❌ MISMATCH: fetched ${commitments.length} but nextIndex=${nextIndex}. Missing deposits!`);
  }

  // 3. Build our JS tree
  const { buildPoseidon } = await import('./node_modules/circomlibjs/main.js');
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const ZERO_VALUE = 6929077469078349753219590094154138880478450472643629583200794044453396342555n;

  // Build zeros[]
  const zeros = new Array(levels + 1);
  zeros[0] = ZERO_VALUE;
  for (let i = 1; i <= levels; i++) {
    zeros[i] = BigInt(F.toString(poseidon([zeros[i-1], zeros[i-1]])));
  }
  console.log(`\nzeros[0] = 0x${zeros[0].toString(16).padStart(64,'0')}`);
  console.log(`zeros[1] = 0x${zeros[1].toString(16).padStart(64,'0')}`);

  // Compute root from leaves
  function hashPair(l, r) {
    return BigInt(F.toString(poseidon([l, r])));
  }

  let layer = [...commitments];
  for (let level = 0; level < levels; level++) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const l = layer[i];
      const r = i + 1 < layer.length ? layer[i + 1] : zeros[level];
      next.push(hashPair(l, r));
    }
    layer = next.length > 0 ? next : [zeros[level + 1]];
  }
  const ourRoot = layer[0] ?? zeros[levels];

  console.log(`\nOur computed root:  0x${ourRoot.toString(16).padStart(64,'0')}`);
  console.log(`On-chain root:      0x${onChainRoot.toString(16).padStart(64,'0')}`);

  if (ourRoot === onChainRoot) {
    console.log('\n✅ ROOTS MATCH — tree is correct!');
  } else {
    console.log('\n❌ ROOT MISMATCH — tree construction is wrong');

    // Also check: simulate Solidity's incremental _insert to see if that matches
    console.log('\n--- Simulating Solidity incremental insert ---');
    const filledSubtrees = [...zeros.slice(0, levels)];
    let rootsArr = [zeros[levels]];
    let currentRootIndex = 0;

    for (let idx = 0; idx < commitments.length; idx++) {
      let currentIndex = idx;
      let currentLevelHash = commitments[idx];

      for (let i = 0; i < levels; i++) {
        let left, right;
        if (currentIndex % 2 === 0) {
          left = currentLevelHash;
          right = filledSubtrees[i];
          filledSubtrees[i] = currentLevelHash;
        } else {
          left = filledSubtrees[i];
          right = currentLevelHash;
        }
        currentLevelHash = hashPair(left, right);
        currentIndex = Math.floor(currentIndex / 2);
      }

      currentRootIndex = (currentRootIndex + 1) % 30;
      rootsArr[currentRootIndex] = currentLevelHash;
    }

    const solidityRoot = rootsArr[currentRootIndex];
    console.log(`Solidity sim root:  0x${solidityRoot.toString(16).padStart(64,'0')}`);
    if (solidityRoot === onChainRoot) {
      console.log('✅ Solidity simulation matches on-chain — our batch tree is wrong');
    } else {
      console.log('❌ Solidity simulation ALSO wrong — hash function mismatch with on-chain Poseidon?');
    }
  }
}

main().catch(console.error);
