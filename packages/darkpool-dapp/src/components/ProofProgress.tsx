import { motion } from 'framer-motion';

interface ProofProgressProps {
  step: string;
}

const STEPS = [
  'Parsing note...',
  'Checking nullifier status...',
  'Fetching deposit history from chain...',
  'Building Merkle proof...',
  'Generating ZK proof (this takes ~30s)...',
];

function stepIndex(current: string): number {
  const i = STEPS.findIndex(s => s === current);
  return i === -1 ? 0 : i;
}

export function ProofProgress({ step }: ProofProgressProps) {
  const current = stepIndex(step);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="card py-10 space-y-8"
    >
      {/* Spinner */}
      <div className="flex justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-2 border-red/20" style={{ borderRadius: 0 }} />
          <motion.div
            className="absolute inset-0 border-2 border-transparent border-t-red"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{ borderRadius: 0 }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-red font-anton text-xs tracking-widest">ZK</span>
          </div>
        </div>
      </div>

      {/* Step list */}
      <div className="max-w-sm mx-auto space-y-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-4 h-4 shrink-0 flex items-center justify-center font-anton text-xs ${
                done ? 'bg-red text-white' :
                active ? 'border-2 border-red text-red' :
                'border border-border text-border'
              }`}>
                {done ? '✓' : String(i + 1)}
              </div>
              <span className={`text-sm font-body transition-colors ${
                done ? 'text-muted line-through' :
                active ? 'text-white' :
                'text-border'
              }`}>
                {s.replace('...', '')}
              </span>
            </div>
          );
        })}
      </div>

      {/* Local proof notice */}
      <div className="border border-border p-4 max-w-sm mx-auto">
        <p className="text-muted text-xs font-body text-center leading-relaxed">
          Proof generated locally in your browser.<br/>
          Your secret never leaves this device. Do not close this tab.
        </p>
      </div>
    </motion.div>
  );
}
