/**
 * Saiko DarkPool — Note Store
 *
 * Persists encrypted DarkPool notes in localStorage.
 * All notes are encrypted with AES-256-GCM before storage.
 * Plaintext notes NEVER touch localStorage.
 */

import type { DarkPoolNote } from './types.js';
import { encryptNote, decryptNote } from './crypto.js';

const STORAGE_KEY = 'saiko-darkpool-notes';

/** Encrypt and save a note to the local note store. */
export async function saveNote(note: DarkPoolNote, password: string): Promise<void> {
  const existing = await loadNotesRaw(password);
  existing.push(note);
  await saveAll(existing, password);
}

/** Load and decrypt all notes from the local note store. */
export async function loadNotes(password: string): Promise<DarkPoolNote[]> {
  return loadNotesRaw(password);
}

/** Un-mark a note as spent (recovery when on-chain tx reverted but local state was set). */
export async function markNoteUnspent(commitment: string, password: string): Promise<void> {
  const notes = await loadNotesRaw(password);
  const updated = notes.map((n) =>
    n.commitment === commitment
      ? { ...n, isSpent: false } as DarkPoolNote
      : n,
  );
  await saveAll(updated, password);
}

/** Mark a note as spent by commitment, then re-save. */
export async function markNoteSpent(commitment: string, password: string): Promise<void> {
  const notes = await loadNotesRaw(password);
  const updated = notes.map((n) =>
    n.commitment === commitment
      ? { ...n, isSpent: true } as DarkPoolNote
      : n,
  );
  await saveAll(updated, password);
}

/**
 * Export a note as plaintext JSON (user-initiated backup).
 *
 * SECURITY: This exports plaintext secret and nullifier bytes. Only call when
 * user explicitly requests backup. Ensure output is immediately encrypted or
 * saved to a file, never logged.
 */
export function exportNoteAsJson(note: DarkPoolNote): string {
  return JSON.stringify({
    secret: Array.from(note.secret),
    nullifier: Array.from(note.nullifier),
    commitment: note.commitment,
    amount: note.amount.toString(),
    tier: note.tier,
    timestamp: note.timestamp,
    txHash: note.txHash,
    viewingKey: Array.from(note.viewingKey),
    isSpent: note.isSpent,
  }, null, 2);
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function loadNotesRaw(password: string): Promise<DarkPoolNote[]> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  const encryptedList = JSON.parse(raw) as string[];
  const notes: DarkPoolNote[] = [];
  for (const encrypted of encryptedList) {
    notes.push(await decryptNote(encrypted, password));
  }
  return notes;
}

async function saveAll(notes: DarkPoolNote[], password: string): Promise<void> {
  const encryptedList: string[] = [];
  for (const note of notes) {
    encryptedList.push(await encryptNote(note, password));
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedList));
}
