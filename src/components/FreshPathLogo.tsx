import React from 'react';

interface Props {
  className?: string;
  size?: number;
}

export const FreshPathLogo: React.FC<Props> = ({ className = 'w-10 h-10', size }) => {
  return (
    <img
      src="/logo192.png"
      alt="FreshPath Link"
      width={size || undefined}
      height={size || undefined}
      className={className}
    />
  );
};
