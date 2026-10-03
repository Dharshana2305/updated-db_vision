import React from 'react';
import { FindingSeverity } from '../types.js';

interface SeverityBadgeProps {
  severity: FindingSeverity;
  size?: 'sm' | 'md' | 'lg';
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, size = 'sm' }) => {
  const styles: Record<FindingSeverity, string> = {
    CRITICAL: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    LOW: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    INFO: 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-md border tracking-wider uppercase font-mono ${styles[severity] || styles.INFO} ${sizeStyles[size]}`}
    >
      {severity}
    </span>
  );
};
