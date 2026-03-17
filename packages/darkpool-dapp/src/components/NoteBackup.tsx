import { useState } from 'react';
import { motion } from 'framer-motion';

interface NoteBackupProps {
  noteString: string;
  onConfirmed: () => void;
}

export function NoteBackup({ noteString, onConfirmed }: NoteBackupProps) {
  const [copied, setCopied] = useState(false);
  const [checkedSaved, setCheckedSaved] = useState(false);
  const [checkedUnderstood, setCheckedUnderstood] = useState(false);

  function copyNote() {
    navigator.clipboard.writeText(noteString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function downloadNote() {
    const blob = new Blob([noteString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saiko-darkpool-note-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canProceed = checkedSaved && checkedUnderstood;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Critical warning */}
      <div className="border-2 border-red p-6 bg-red/5 space-y-3">
        <div className="font-anton text-red text-3xl tracking-wider">
          ⚠ BACK UP YOUR NOTE
        </div>
        <div className="space-y-2 text-sm font-body">
          <p className="text-white font-bold">
            This note is the ONLY key to your SAIKO. There is no recovery.
          </p>
          <p className="text-muted">
            If you lose this note, your funds are gone. Permanently. No support ticket will fix it.
            No one can help you. The ZK proof requires secrets only this note contains.
          </p>
          <p className="text-muted">
            Store it: password manager · encrypted file · written on paper stored offline.
            Do not screenshot. Do not email. Do not store in cloud notes.
          </p>
        </div>
      </div>

      {/* Note display */}
      <div className="card space-y-3">
        <div className="font-anton text-xs text-muted tracking-widest">YOUR NOTE — SELECT ALL TO COPY</div>
        <div
          className="bg-bg border border-border p-4 font-mono text-xs text-white break-all leading-relaxed select-all cursor-text"
          style={{ wordBreak: 'break-all' }}
          onClick={copyNote}
        >
          {noteString}
        </div>
        <div className="flex gap-2">
          <button onClick={copyNote} className="btn-red flex-1 text-sm">
            {copied ? '✓ COPIED' : 'COPY'}
          </button>
          <button onClick={downloadNote} className="btn-outline flex-1 text-sm">
            DOWNLOAD .TXT
          </button>
        </div>
      </div>

      {/* Dual confirmation checkboxes */}
      <div className="border border-border p-4 space-y-4">
        <div className="font-anton text-xs text-muted tracking-widest">CONFIRM BEFORE PROCEEDING</div>

        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={checkedSaved}
            onChange={e => setCheckedSaved(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red flex-shrink-0"
          />
          <span className="text-sm font-body text-muted group-hover:text-white transition-colors">
            I have saved my note in a secure location. I can retrieve it later.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={checkedUnderstood}
            onChange={e => setCheckedUnderstood(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red flex-shrink-0"
          />
          <span className="text-sm font-body text-muted group-hover:text-white transition-colors">
            I understand that if I lose this note, my funds are permanently unrecoverable.
            No one can help me.
          </span>
        </label>
      </div>

      <button
        onClick={onConfirmed}
        disabled={!canProceed}
        className="btn-red w-full text-base"
      >
        {canProceed ? 'PROCEED TO DEPOSIT' : 'CONFIRM BOTH BOXES ABOVE'}
      </button>
    </motion.div>
  );
}
