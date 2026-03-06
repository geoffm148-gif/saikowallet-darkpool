/**
 * Data retention policy — auto-purge old transaction history and logs.
 *
 * WHY data retention matters: Old transaction history stored indefinitely
 * is a liability. If a device is seized or compromised, years of on-device
 * transaction history reveals behavioral patterns, trading history, and
 * counterparty relationships. Users should control how long their own
 * metadata is retained.
 *
 * Design: purely functional, no side effects. The policy is a config object.
 * Actual storage deletion is done by the platform layer (SQLCipher, files).
 * wallet-core provides the logic to determine WHAT should be purged.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetentionPolicy {
  /** Maximum age in milliseconds. Records older than this should be purged. */
  readonly maxAgeMs: number;
  /** Human-readable label for the policy (e.g. "30 days"). */
  readonly label: string;
  /** Whether to enable automatic purging (user opt-in). */
  readonly autoEnabled: boolean;
}

/**
 * A record that carries a timestamp, used for retention filtering.
 * WHY generic: The policy applies to transactions, logs, RPC cache entries —
 * anything time-ordered. Generic T lets the type system enforce that callers
 * don't accidentally discard the wrong kind of record.
 */
export interface TimestampedRecord<T> {
  /** Unix millisecond timestamp when this record was created/received. */
  readonly timestamp: number;
  readonly data: T;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Preset retention policies. Users pick one (or set custom). */
export const RETENTION_PRESETS = {
  SEVEN_DAYS: createRetentionPolicy(7),
  THIRTY_DAYS: createRetentionPolicy(30),
  NINETY_DAYS: createRetentionPolicy(90),
  ONE_YEAR: createRetentionPolicy(365),
  /** Keep everything — no auto-purge. */
  FOREVER: {
    maxAgeMs: Number.MAX_SAFE_INTEGER,
    label: 'Forever (no auto-purge)',
    autoEnabled: false,
  } satisfies RetentionPolicy,
} as const;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a retention policy that purges records older than `maxAgeDays`.
 *
 * @param maxAgeDays - Maximum number of days to keep records (must be positive)
 *
 * WHY days as the unit: Users think in days/months, not milliseconds.
 * We convert internally to ms for consistent timestamp arithmetic.
 */
export function createRetentionPolicy(maxAgeDays: number): RetentionPolicy {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    throw new Error(`maxAgeDays must be a positive number, got ${maxAgeDays}`);
  }

  const maxAgeMs = Math.floor(maxAgeDays * MS_PER_DAY);
  const label = maxAgeDays === 1
    ? '1 day'
    : maxAgeDays < 30
    ? `${maxAgeDays} days`
    : maxAgeDays < 365
    ? `${Math.round(maxAgeDays / 30)} month${Math.round(maxAgeDays / 30) === 1 ? '' : 's'}`
    : `${Math.round(maxAgeDays / 365)} year${Math.round(maxAgeDays / 365) === 1 ? '' : 's'}`;

  return {
    maxAgeMs,
    label,
    autoEnabled: true,
  };
}

/**
 * Filter a list of timestamped records, returning only those that should
 * NOT be purged (i.e., records within the retention window).
 *
 * WHY we return the kept records (not the purged ones): The caller typically
 * wants to update their store with the surviving records. Returning the
 * purged set would require the caller to subtract it from the full list,
 * which is error-prone.
 *
 * @param records - All records to evaluate
 * @param policy  - The retention policy to apply
 * @param now     - Current time in Unix ms (injectable for testing)
 */
export function filterExpiredRecords<T>(
  records: readonly TimestampedRecord<T>[],
  policy: RetentionPolicy,
  now: number = Date.now(),
): readonly TimestampedRecord<T>[] {
  return records.filter((record) => !shouldPurge(record.timestamp, policy, now));
}

/**
 * Check if a single record's timestamp is old enough to be purged.
 *
 * @param timestamp - Unix millisecond timestamp of the record
 * @param policy    - The retention policy
 * @param now       - Current time in Unix ms (injectable for testing)
 * @returns true if the record is expired and should be deleted
 */
export function shouldPurge(
  timestamp: number,
  policy: RetentionPolicy,
  now: number = Date.now(),
): boolean {
  if (!policy.autoEnabled) return false;
  const ageMs = now - timestamp;
  return ageMs > policy.maxAgeMs;
}

/**
 * Split records into two lists: those to keep and those to purge.
 * WHY: Some callers need both lists (e.g., to log what was purged before deletion).
 */
export function partitionByRetention<T>(
  records: readonly TimestampedRecord<T>[],
  policy: RetentionPolicy,
  now: number = Date.now(),
): { keep: readonly TimestampedRecord<T>[]; purge: readonly TimestampedRecord<T>[] } {
  const keep: TimestampedRecord<T>[] = [];
  const purge: TimestampedRecord<T>[] = [];

  for (const record of records) {
    if (shouldPurge(record.timestamp, policy, now)) {
      purge.push(record);
    } else {
      keep.push(record);
    }
  }

  return { keep, purge };
}

/**
 * Count how many records would be purged under a given policy.
 * WHY: Useful for showing the user a preview ("This will delete 47 records")
 * before they confirm the purge operation.
 */
export function countExpiredRecords<T>(
  records: readonly TimestampedRecord<T>[],
  policy: RetentionPolicy,
  now: number = Date.now(),
): number {
  return records.filter((r) => shouldPurge(r.timestamp, policy, now)).length;
}
