import { TIER_LABELS, DARKPOOL_FEE_BPS, BPS_DENOMINATOR, TIER_AMOUNTS_WEI } from '../constants';
import { formatSaiko } from '../utils/note';

interface TierCardProps {
  tierIndex: number;
  selected: boolean;
  onSelect: () => void;
  depositCount?: number;
}

function privacyMeta(count: number) {
  if (count === 0)  return { label: 'EMPTY',    color: 'text-border',   bar: 0  };
  if (count < 5)   return { label: 'VERY LOW',  color: 'text-red',      bar: 1  };
  if (count < 20)  return { label: 'LOW',       color: 'text-red',      bar: 2  };
  if (count < 50)  return { label: 'MODERATE',  color: 'text-yellow-400', bar: 3 };
  if (count < 200) return { label: 'STRONG',    color: 'text-green-400', bar: 4 };
  return             { label: 'MAXIMUM',   color: 'text-green-400', bar: 5 };
}

const BAR_SEGMENTS = 5;

export function TierCard({ tierIndex, selected, onSelect, depositCount = 0 }: TierCardProps) {
  const amount = TIER_AMOUNTS_WEI[tierIndex]!;
  const fee = (amount * DARKPOOL_FEE_BPS) / BPS_DENOMINATOR;
  const youReceive = amount - fee;
  const p = privacyMeta(depositCount);

  return (
    <button
      onClick={onSelect}
      className={`text-left cursor-pointer transition-all w-full p-5 ${
        selected
          ? 'border-2 border-red bg-red/5'
          : 'border border-border bg-surface hover:border-muted'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-anton text-3xl text-white tracking-wide leading-none">
            {TIER_LABELS[tierIndex]}
          </div>
          <div className="text-muted text-xs font-body mt-1">
            fixed denomination · all deposits indistinguishable
          </div>
        </div>
        {selected && (
          <div className="font-anton text-xs text-red tracking-widest mt-1">SELECTED</div>
        )}
      </div>

      <div className="space-y-2 text-sm font-body mb-4">
        <div className="flex justify-between text-muted">
          <span>Deposit fee (0.5%)</span>
          <span className="text-white font-mono">{formatSaiko(fee)} SAIKO</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>You receive in pool</span>
          <span className="text-white font-mono">{formatSaiko(youReceive)} SAIKO</span>
        </div>
      </div>

      {/* Anonymity set */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-muted text-xs font-body">ANONYMITY SET</span>
          <span className={`font-anton text-xs tracking-widest ${p.color}`}>
            {p.label}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: BAR_SEGMENTS }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 transition-colors ${i < p.bar ? 'bg-red' : 'bg-border'}`}
            />
          ))}
        </div>
        <div className="text-muted text-xs font-body">
          {depositCount === 0
            ? 'No deposits yet — wait for others to join for privacy'
            : `${depositCount} deposit${depositCount === 1 ? '' : 's'} · more = stronger anonymity`}
        </div>
      </div>
    </button>
  );
}
