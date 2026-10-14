import React from 'react';
import { FreshnessBadgeStatus } from '../lib/freshness';
import { Sparkles, AlertTriangle, AlertCircle } from 'lucide-react';

interface Props {
  status: FreshnessBadgeStatus;
  score?: number;
  label?: string;
  showEstimateLabel?: boolean;
}

export const FreshnessBadge: React.FC<Props> = ({
  status,
  score,
  label,
  showEstimateLabel = true,
}) => {
  let badgeStyle =
    'bg-emerald-500/15 border-emerald-400/30 text-emerald-400 shadow-[0_0_15px_rgba(74,222,128,0.25)]';
  let Icon = Sparkles;
  let text = label || 'Fresh';

  if (status === 'SELL_SOON') {
    badgeStyle =
      'bg-amber-500/15 border-amber-400/30 text-amber-300 shadow-[0_0_15px_rgba(217,119,6,0.25)]';
    Icon = AlertTriangle;
    text = label || 'Sell soon';
  } else if (status === 'CHECK_QUALITY') {
    badgeStyle =
      'bg-red-500/15 border-red-400/30 text-red-400 shadow-[0_0_15px_rgba(193,18,31,0.30)]';
    Icon = AlertCircle;
    text = label || 'Check quality';
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md transition-all ${badgeStyle}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="tracking-wide">{text}</span>
        {score !== undefined && (
          <span className="opacity-80 font-mono tabular-nums">({score}/100)</span>
        )}
      </span>
      {showEstimateLabel && (
        <span className="text-[10px] text-slate-400 italic pl-1 font-medium">
          Estimate based on harvest & storage
        </span>
      )}
    </div>
  );
};
