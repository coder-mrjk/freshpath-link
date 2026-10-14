import React from 'react';
import { StorageReading, STORAGE_DEFAULTS, parseReadingDate } from '../lib/storage';
import { formatIST } from '../lib/time';

interface StorageChartProps {
  readings: StorageReading[];
  className?: string;
}

export const StorageChart: React.FC<StorageChartProps> = ({ readings, className = '' }) => {
  if (!readings || readings.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl text-xs text-slate-400 ${className}`}>
        <span>No telemetry readings recorded yet for this unit.</span>
        <span className="text-[10px] text-slate-400 mt-1">
          Target optimal envelope: {STORAGE_DEFAULTS.TARGET_TEMP_MIN}°C – {STORAGE_DEFAULTS.TARGET_TEMP_MAX}°C
        </span>
      </div>
    );
  }

  // Sort readings chronologically
  const sorted = [...readings].sort(
    (a, b) => parseReadingDate(a.at).getTime() - parseReadingDate(b.at).getTime()
  );

  // Determine graph bounds
  const temps = sorted.map((r) => Number(r.tempC) || 0);
  const minTemp = Math.min(8, Math.floor(Math.min(...temps)));
  const maxTemp = Math.max(25, Math.ceil(Math.max(...temps)));
  const tempRange = Math.max(5, maxTemp - minTemp);

  // SVG dimensions
  const width = 500;
  const height = 160;
  const paddingX = 40;
  const paddingY = 20;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  // Coordinate mapper
  const getX = (index: number) => {
    if (sorted.length === 1) return paddingX + chartW / 2;
    return paddingX + (index / (sorted.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    const norm = (val - minTemp) / tempRange;
    return height - paddingY - norm * chartH;
  };

  // Generate Path for temperature
  const tempPoints = sorted.map((r, i) => `${getX(i)},${getY(Number(r.tempC) || 0)}`);
  const pathD = tempPoints.length > 0 ? `M ${tempPoints.join(' L ')}` : '';

  // Green target band: 12°C to 15°C
  const targetTopY = getY(STORAGE_DEFAULTS.TARGET_TEMP_MAX);
  const targetBottomY = getY(STORAGE_DEFAULTS.TARGET_TEMP_MIN);
  const targetBandHeight = Math.max(4, targetBottomY - targetTopY);

  return (
    <div className={`relative backdrop-blur-xl bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">24h Temperature Trend</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-400/30">
            Target 12°C – 15°C
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {sorted.length} readings
        </span>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Optimal Target Zone Rectangle */}
          <rect
            x={paddingX}
            y={targetTopY}
            width={chartW}
            height={targetBandHeight}
            fill="#4ADE80"
            fillOpacity="0.12"
            rx="4"
          />
          <text
            x={paddingX + 6}
            y={targetTopY + 12}
            fill="#4ADE80"
            fontSize="9"
            fontWeight="bold"
          >
            Optimal Safe Zone (12°C - 15°C)
          </text>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />
          <text x={paddingX - 6} y={paddingY + 3} fill="#94A3B8" fontSize="9" textAnchor="end">
            {maxTemp}°C
          </text>

          <line
            x1={paddingX}
            y1={getY(15)}
            x2={width - paddingX}
            y2={getY(15)}
            stroke="#4ADE80"
            strokeDasharray="2 2"
            strokeOpacity="0.5"
          />
          <line
            x1={paddingX}
            y1={getY(12)}
            x2={width - paddingX}
            y2={getY(12)}
            stroke="#4ADE80"
            strokeDasharray="2 2"
            strokeOpacity="0.5"
          />

          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="rgba(255,255,255,0.1)"
          />
          <text
            x={paddingX - 6}
            y={height - paddingY + 3}
            fill="#94A3B8"
            fontSize="9"
            textAnchor="end"
          >
            {minTemp}°C
          </text>

          {/* Temperature Trend Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#38BDF8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {sorted.map((r, i) => {
            const x = getX(i);
            const y = getY(Number(r.tempC) || 0);
            const isOutOfRange =
              r.tempC > STORAGE_DEFAULTS.TARGET_TEMP_MAX ||
              r.tempC < STORAGE_DEFAULTS.TARGET_TEMP_MIN;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill={isOutOfRange ? '#EF4444' : '#38BDF8'}
                  stroke="#0F172A"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Reading Time Range Labels */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1 font-mono">
        <span>Earliest: {formatIST(parseReadingDate(sorted[0].at))}</span>
        <span>Latest: {formatIST(parseReadingDate(sorted[sorted.length - 1].at))}</span>
      </div>
    </div>
  );
};
