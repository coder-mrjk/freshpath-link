import React from 'react';

interface Props {
  className?: string;
  size?: number;
}

export const FreshPathLogo: React.FC<Props> = ({ className = 'w-10 h-10', size }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size || undefined}
      height={size || undefined}
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id="fpReactTomatoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF4D4D" />
          <stop offset="45%" stopColor="#E62E2E" />
          <stop offset="100%" stopColor="#C51616" />
        </linearGradient>

        <linearGradient id="fpReactLeafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        <filter id="fpReactShadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#7A0000" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Tomato Body */}
      <g filter="url(#fpReactShadow)">
        <path
          d="M60 26 C36 26 20 40 20 66 C20 92 38 106 60 106 C82 106 100 92 100 66 C100 40 84 26 60 26 Z"
          fill="url(#fpReactTomatoGrad)"
        />
        {/* Highlight Curve */}
        <path
          d="M30 46 C34 38 44 32 55 30 C51 34 46 42 45 52 C45 55 42 55 40 54 C35 52 32 49 30 46 Z"
          fill="#FFFFFF"
          opacity="0.3"
        />
      </g>

      {/* Intertwined Digital Chain Link */}
      <g fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M46 54 L54 46 C58 42 64 42 68 46 L70 48 C74 52 74 58 70 62 L66 66" />
        <path d="M74 74 L66 82 C62 86 56 86 52 82 L50 80 C46 76 46 70 50 66 L54 62" />
        <circle cx="50" cy="50" r="2.5" fill="#FFFFFF" stroke="none" />
        <circle cx="70" cy="78" r="2.5" fill="#FFFFFF" stroke="none" />
        <circle cx="60" cy="64" r="3" fill="#FFFFFF" stroke="#E62E2E" strokeWidth="2" />
      </g>

      {/* Organic Stem & Leaves */}
      <g fill="url(#fpReactLeafGrad)">
        <path d="M57 14 C58 8 64 6 68 8 C65 13 63 17 62 26 C60 26 59 26 57 26 C57 20 56 16 57 14 Z" />
        <path d="M60 26 C48 24 36 17 32 24 C36 29 46 29 60 28 Z" />
        <path d="M60 26 C72 23 85 17 88 23 C84 29 74 29 60 28 Z" />
        <path d="M60 26 C57 32 55 38 60 41 C64 38 63 32 60 26 Z" />
      </g>
    </svg>
  );
};
