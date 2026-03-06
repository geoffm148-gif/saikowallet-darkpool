/**
 * Custom error classes for Saiko Wallet core engine.
 *
 * WHY: Typed errors allow callers to catch and handle specific failure modes
 * (e.g. retry on RPCTimeoutError, abort on InvalidSeedError). Generic Error
 * objects force instanceof checks against string messages — fragile and unsafe.
 *
 * Each class includes a human-readable `message` (safe to surface in UI)
 * and optional `cause` for debugging (must never contain keys/seeds).
 */

// ─── Keychain Errors ──────────────────────────────────────────────────────────

export class InvalidSeedError extends Error {
  public override readonly name = 'InvalidSeedError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, InvalidSeedError.prototype);
  }
}

export class DerivationError extends Error {
  public override readonly name = 'DerivationError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, DerivationError.prototype);
  }
}

// ─── Crypto Errors ───────────────────────────────────────────────────────────

export class EncryptionError extends Error {
  public override readonly name = 'EncryptionError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, EncryptionError.prototype);
  }
}

export class DecryptionError extends Error {
  public override readonly name = 'DecryptionError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, DecryptionError.prototype);
  }
}

// ─── Transaction Errors ───────────────────────────────────────────────────────

export class InsufficientFundsError extends Error {
  public override readonly name = 'InsufficientFundsError';

  constructor(
    public readonly required: bigint,
    public readonly available: bigint,
  ) {
    super(
      `Insufficient funds: required ${required.toString()} wei, available ${available.toString()} wei`,
    );
    Object.setPrototypeOf(this, InsufficientFundsError.prototype);
  }
}

export class InvalidAddressError extends Error {
  public override readonly name = 'InvalidAddressError';

  constructor(
    public readonly address: string,
    reason?: string,
  ) {
    super(
      `Invalid Ethereum address "${address}"${reason ? `: ${reason}` : ''}`,
    );
    Object.setPrototypeOf(this, InvalidAddressError.prototype);
  }
}

export class GasEstimationError extends Error {
  public override readonly name = 'GasEstimationError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, GasEstimationError.prototype);
  }
}

export class NonceError extends Error {
  public override readonly name = 'NonceError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, NonceError.prototype);
  }
}

export class SigningError extends Error {
  public override readonly name = 'SigningError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, SigningError.prototype);
  }
}

export class TransactionBuildError extends Error {
  public override readonly name = 'TransactionBuildError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, TransactionBuildError.prototype);
  }
}

// ─── RPC / Network Errors ────────────────────────────────────────────────────

export class RPCTimeoutError extends Error {
  public override readonly name = 'RPCTimeoutError';

  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`RPC request to ${url} timed out after ${timeoutMs}ms`);
    Object.setPrototypeOf(this, RPCTimeoutError.prototype);
  }
}

export class RPCError extends Error {
  public override readonly name = 'RPCError';

  constructor(
    message: string,
    public readonly code: number,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, RPCError.prototype);
  }
}

export class AllProvidersFailedError extends Error {
  public override readonly name = 'AllProvidersFailedError';

  constructor(public readonly errors: readonly Error[]) {
    super(
      `All RPC providers failed. Last error: ${errors[errors.length - 1]?.message ?? 'unknown'}`,
    );
    Object.setPrototypeOf(this, AllProvidersFailedError.prototype);
  }
}

export class RpcValidationError extends Error {
  public override readonly name = 'RpcValidationError';

  constructor(
    public readonly method: string,
    public readonly detail: string,
  ) {
    super(`RPC validation failed for ${method}: ${detail}`);
    Object.setPrototypeOf(this, RpcValidationError.prototype);
  }
}

export class ChainIdMismatchError extends Error {
  public override readonly name = 'ChainIdMismatchError';

  constructor(
    public readonly expected: number,
    public readonly received: number,
  ) {
    super(
      `Chain ID mismatch: expected ${expected}, received ${received}. Possible chain-switching attack.`,
    );
    Object.setPrototypeOf(this, ChainIdMismatchError.prototype);
  }
}

// ─── Token Errors ────────────────────────────────────────────────────────────

export class TokenNotFoundError extends Error {
  public override readonly name = 'TokenNotFoundError';

  constructor(addressOrSymbol: string) {
    super(`Token not found: ${addressOrSymbol}`);
    Object.setPrototypeOf(this, TokenNotFoundError.prototype);
  }
}

export class InvalidTokenAmountError extends Error {
  public override readonly name = 'InvalidTokenAmountError';

  constructor(amount: string, reason: string) {
    super(`Invalid token amount "${amount}": ${reason}`);
    Object.setPrototypeOf(this, InvalidTokenAmountError.prototype);
  }
}

// ─── Security Errors ─────────────────────────────────────────────────────────

export class SimulationError extends Error {
  public override readonly name = 'SimulationError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, SimulationError.prototype);
  }
}

export class AddressPoisoningError extends Error {
  public override readonly name = 'AddressPoisoningError';

  constructor(
    public readonly suspiciousAddress: string,
    public readonly similarTo: string,
  ) {
    super(
      `Address "${suspiciousAddress}" appears similar to known contact "${similarTo}" — possible poisoning attack`,
    );
    Object.setPrototypeOf(this, AddressPoisoningError.prototype);
  }
}

// ─── Backup / Recovery Errors ─────────────────────────────────────────────────

export class BackupError extends Error {
  public override readonly name = 'BackupError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, BackupError.prototype);
  }
}

export class RestoreError extends Error {
  public override readonly name = 'RestoreError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, RestoreError.prototype);
  }
}

export class ShamirError extends Error {
  public override readonly name = 'ShamirError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, ShamirError.prototype);
  }
}

export class RecoveryVerificationError extends Error {
  public override readonly name = 'RecoveryVerificationError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, RecoveryVerificationError.prototype);
  }
}

// ─── Auth Errors ──────────────────────────────────────────────────────────────

export class PinError extends Error {
  public override readonly name = 'PinError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, PinError.prototype);
  }
}

export class SessionError extends Error {
  public override readonly name = 'SessionError';

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

export class ReauthRequiredError extends Error {
  public override readonly name = 'ReauthRequiredError';

  constructor(public readonly operation: string) {
    super(`Re-authentication required for operation: ${operation}`);
    Object.setPrototypeOf(this, ReauthRequiredError.prototype);
  }
}

export class WalletLockedError extends Error {
  public override readonly name = 'WalletLockedError';

  constructor() {
    super('Wallet is locked. Please authenticate to continue.');
    Object.setPrototypeOf(this, WalletLockedError.prototype);
  }
}
