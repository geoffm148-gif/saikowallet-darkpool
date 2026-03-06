/**
 * Memory wiping utilities for sensitive cryptographic material.
 *
 * WHY: JavaScript's garbage collector does not guarantee when memory is
 * freed or whether it zeros memory before reuse. A compromised process
 * (or OS-level memory dump) could read private keys, seeds, or passphrases
 * from "freed" heap memory. We zero-out sensitive buffers the moment we're
 * done with them.
 *
 * LIMITATION: JavaScript engines (V8, SpiderMonkey) may copy buffer contents
 * during GC compaction. We cannot fully prevent this, but zeroing the
 * original buffer significantly reduces the attack window and the amount
 * of plaintext material that could be recovered from a heap dump.
 *
 * This is a defense-in-depth measure, not a complete solution. For maximum
 * key security, use platform secure enclaves (iOS Keychain, Android Keystore).
 */

/**
 * Overwrite a Uint8Array with zeros in-place.
 * Call this immediately after you're done with sensitive key material.
 */
export function wipeBytes(buffer: Uint8Array): void {
  // fill(0) writes zeros to every byte position
  // WHY we use a loop as secondary measure: Some engines may optimize fill(0)
  // away if they detect the buffer is "about to be GC'd". The loop is harder
  // to dead-code-eliminate.
  buffer.fill(0);
  // Secondary pass to prevent optimizer from eliding the fill
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = 0;
  }
}

/**
 * Overwrite a Node.js Buffer with zeros.
 * Buffer extends Uint8Array, so wipeBytes works, but this alias is clearer.
 */
export function wipeBuffer(buffer: Buffer): void {
  buffer.fill(0);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = 0;
  }
}

/**
 * Overwrite multiple byte arrays in a single call.
 * WHY: Convenient for cleanup at the end of a function that holds multiple
 * sensitive buffers (e.g., key + salt + plaintext all in scope).
 */
export function wipeAll(...buffers: Uint8Array[]): void {
  for (const buf of buffers) {
    wipeBytes(buf);
  }
}

/**
 * Run an operation with a sensitive buffer, then zero the buffer regardless
 * of success or failure.
 *
 * WHY: Using try/finally guarantees the wipe happens even if the callback
 * throws. Without this, an exception path could leave key material in memory.
 */
export async function withWipe<T>(
  sensitiveBuffer: Uint8Array,
  operation: (buf: Uint8Array) => Promise<T>,
): Promise<T> {
  try {
    return await operation(sensitiveBuffer);
  } finally {
    wipeBytes(sensitiveBuffer);
  }
}

/**
 * Synchronous variant of withWipe.
 */
export function withWipeSync<T>(
  sensitiveBuffer: Uint8Array,
  operation: (buf: Uint8Array) => T,
): T {
  try {
    return operation(sensitiveBuffer);
  } finally {
    wipeBytes(sensitiveBuffer);
  }
}
