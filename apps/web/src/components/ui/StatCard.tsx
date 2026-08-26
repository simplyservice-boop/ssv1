import React, { createElement } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  icon?: React.ReactNode | React.ElementType;
  color?: string;
  change?: number;
  changeLabel?: string;
  trend?: { value: number; label?: string };
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  indigo: 'bg-indigo-500',
};

export function StatCard({ title, value, icon, color = 'bg-blue-500', change, changeLabel, trend }: Props) {
  const resolvedColor = colorMap[color] ?? color ?? 'bg-blue-500';
  const trendValue = trend?.value ?? change;
  const IconElement = React.isValidElement(icon)
    ? icon
    : typeof icon === 'function'
      ? createElement(icon as React.ElementType, { className: 'w-6 h-6 text-white' })
      : null;

  const trendDisplay = typeof trendValue === 'number' ? trendValue : 0;
  const trendLabel = trend?.label ?? changeLabel;

  return (
    <div className="card flex items-start gap-4">
      <div className={`${resolvedColor} p-3 rounded-xl flex-shrink-0`}>
        {IconElement ?? <TrendingUp className="w-6 h-6 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 truncate">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {(typeof trendValue === 'number') && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trendDisplay >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trendDisplay >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{trendDisplay >= 0 ? '+' : ''}{trendDisplay}%</span>
            {trendLabel && <span className="text-gray-400 font-normal">{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
