/**
 * Offscreen ZK Worker — runs in a hidden offscreen document (Chrome 116+).
 *
 * Receives witness inputs from the service worker, loads snarkjs + circuit
 * files, generates a Groth16 proof, and returns the result.
 */
import { groth16 } from 'snarkjs';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'zk:generateProof') return false;

  (async () => {
    try {
      const wasmUrl = chrome.runtime.getURL('circuits/withdrawal.wasm');
      const zkeyUrl = chrome.runtime.getURL('circuits/withdrawal.zkey');

      const [wasmResp, zkeyResp] = await Promise.all([
        fetch(wasmUrl),
        fetch(zkeyUrl),
      ]);
      const [wasmBuffer, zkeyBuffer] = await Promise.all([
        wasmResp.arrayBuffer(),
        zkeyResp.arrayBuffer(),
      ]);

      const { proof, publicSignals } = await groth16.fullProve(
        message.input,
        new Uint8Array(wasmBuffer),
        new Uint8Array(zkeyBuffer),
      );

      sendResponse({ success: true, proof, publicSignals });
    } catch (err) {
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();

  return true; // async response
});
