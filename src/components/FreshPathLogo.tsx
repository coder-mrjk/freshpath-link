import React from 'react';

interface Props {
  className?: string;
  size?: number;
}

export const FreshPathLogo: React.FC<Props> = ({ className = 'w-10 h-10', size }) => {
  return (
    <img
      src="/freshpath-logo.png"
      alt="FreshPath Link Logo"
      width={size || undefined}
      height={size || undefined}
      className={`object-contain rounded-2xl drop-shadow-md select-none ${className}`}
      loading="eager"
    />
  );
};
