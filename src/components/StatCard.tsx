import React, { ReactNode } from 'react';

interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  accentColor?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor = 'border-slate-800',
  onClick
}) => {
  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-slate-900/90 border ${accentColor} rounded-xl p-5 relative overflow-hidden transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-slate-700 hover:bg-slate-900' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-100 mt-1.5 font-mono">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className="p-2.5 rounded-lg bg-slate-800/80 text-sky-400 border border-slate-700/50">
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span className={trend.positive ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
            {trend.value}
          </span>
          <span className="text-slate-500">vs previous run</span>
        </div>
      )}
    </div>
  );
};
