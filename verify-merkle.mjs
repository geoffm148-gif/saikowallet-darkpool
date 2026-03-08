/**
 * Verify new IncrementalMerkleTree: root matches + proofs verify.
 */
import https from 'https';
import { keccak256, toUtf8Bytes } from 'ethers';
import { buildPoseidon } from './node_modules/circomlibjs/main.js';

const DARK_POOL = '0x6d985d3b7d57c3b6acd5c275f761be62b425915b';
const RPC = 'https://ethereum.publicnode.com';
const DEPLOY_BLOCK = 24_594_587;
const CHUNK_SIZE = 49_000;
const LEVELS = 20;
const ZERO_VALUE = 6929077469078349753219590094154138880478450472643629583200794044453396342555n;
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const req = https.request(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => { const j = JSON.parse(data); j.error ? reject(new Error(j.error.message)) : resolve(j.result); });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hash = (l, r) => BigInt(F.toString(poseidon([l, r])));

  const zeros = [ZERO_VALUE];
  for (let i = 1; i <= LEVELS; i++) zeros.push(hash(zeros[i-1], zeros[i-1]));

  // Fetch on-chain data
  const isKnownRootSelector = keccak256(toUtf8Bytes('isKnownRoot(bytes32)')).slice(0,10);
  const onChainRootHex = await rpc('eth_call', [{ to: DARK_POOL, data: '0x' + keccak256(toUtf8Bytes('getLastRoot()')).slice(2,10) }, 'latest']);
  const onChainRoot = BigInt(onChainRootHex);
  console.log(`On-chain getLastRoot(): 0x${onChainRoot.toString(16).padStart(64,'0')}`);

  const depositTopic = keccak256(toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256,address)'));
  const latestHex = await rpc('eth_blockNumber', []);
  const latest = Number(BigInt(latestHex));
  const allLogs = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, latest);
    const chunk = await rpc('eth_getLogs', [{ address: DARK_POOL, topics: [depositTopic], fromBlock: '0x'+from.toString(16), toBlock: '0x'+to.toString(16) }]);
    if (Array.isArray(chunk)) allLogs.push(...chunk);
  }
  const leaves = allLogs.map(log => BigInt(log.topics[1]));
  console.log(`Leaves: ${leaves.length}\n`);

  // Simulate incremental tree (new algorithm)
  function simulate(targetIndex) {
    const fs = [...zeros.slice(0, LEVELS)];
    let lastRoot = zeros[LEVELS];
    let proofCapture = null;
    for (let idx = 0; idx < leaves.length; idx++) {
      let ci = idx, ch = leaves[idx];
      const pe = [], pi = [];
      for (let level = 0; level < LEVELS; level++) {
        const sibling = fs[level];
        pi.push(ci & 1);
        pe.push(sibling);
        let l, r;
        if (ci % 2 === 0) { l = ch; r = sibling; fs[level] = ch; }
        else { l = sibling; r = ch; }
        ch = hash(l, r);
        ci = Math.floor(ci / 2);
      }
      lastRoot = ch;
      if (idx === targetIndex) proofCapture = { pathElements: pe, pathIndices: pi, root: lastRoot };
    }
    return { finalRoot: lastRoot, proofCapture };
  }

  function verifyProof(leaf, pathElements, pathIndices, root) {
    let current = leaf;
    for (let level = 0; level < LEVELS; level++) {
      const sibling = pathElements[level];
      const isRight = pathIndices[level];
      const l = isRight ? sibling : current;
      const r = isRight ? current : sibling;
      current = hash(l, r);
    }
    return current === root;
  }

  const { finalRoot } = simulate(null);
  console.log(`Final root matches on-chain: ${finalRoot === onChainRoot ? '✅' : '❌'}`);

  // Test each leaf's proof
  for (let i = 0; i < leaves.length; i++) {
    const { proofCapture } = simulate(i);
    if (!proofCapture) { console.log(`Leaf[${i}]: ❌ no proof captured`); continue; }
    const valid = verifyProof(leaves[i], proofCapture.pathElements, proofCapture.pathIndices, proofCapture.root);
    
    // Check if the proof's root is known on-chain
    const rootPadded = '0x' + proofCapture.root.toString(16).padStart(64, '0');
    const checkData = isKnownRootSelector + rootPadded.slice(2);
    const isKnownHex = await rpc('eth_call', [{ to: DARK_POOL, data: checkData }, 'latest']);
    const isKnown = BigInt(isKnownHex) === 1n;

    console.log(`Leaf[${i}]: proof self-consistent=${valid ? '✅' : '❌'} | root on-chain=${isKnown ? '✅' : '❌'} | root=0x${proofCapture.root.toString(16).slice(0,16)}...`);
  }
}

main().catch(console.error);
