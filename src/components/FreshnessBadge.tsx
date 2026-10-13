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
  let badgeStyle = 'bg-leaf-100 text-leaf-700 border-leaf-500';
  let Icon = Sparkles;
  let text = label || 'Fresh';

  if (status === 'SELL_SOON') {
    badgeStyle = 'bg-amber-100 text-amber-800 border-amber-500';
    Icon = AlertTriangle;
    text = label || 'Sell soon';
  } else if (status === 'CHECK_QUALITY') {
    badgeStyle = 'bg-red-100 text-red-800 border-red-500';
    Icon = AlertCircle;
    text = label || 'Check quality';
  }

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${badgeStyle}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{text}</span>
        {score !== undefined && <span className="opacity-80">({score}/100)</span>}
      </span>
      {showEstimateLabel && (
        <span className="text-[10px] text-gray-500 italic pl-1">
          Estimate based on harvest & storage
        </span>
      )}
    </div>
  );
};
