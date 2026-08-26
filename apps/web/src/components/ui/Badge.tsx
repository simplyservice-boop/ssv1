import React from 'react';

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string;
  children?: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'info' | 'outline' | string;
  size?: 'sm' | 'md' | 'lg' | string;
  color?: string;
  className?: string;
}

const variantMap: Record<string, string> = {
  default: 'badge-gray',
  primary: 'badge-blue',
  secondary: 'badge-purple',
  danger: 'badge-red',
  success: 'badge-green',
  warning: 'badge-yellow',
  info: 'badge-cyan',
  outline: 'badge-outline',
};

const sizes = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
  lg: 'text-sm px-3 py-1.5',
};

export function Badge({ label, children, variant = 'default', size = 'sm', color, className = '', ...props }: Props) {
  const resolvedVariant = variantMap[variant as keyof typeof variantMap] ?? color ?? variantMap.default;
  const resolvedSize = sizes[size as keyof typeof sizes] ?? sizes.sm;

  return (
    <span className={`${resolvedVariant} ${resolvedSize} inline-flex items-center rounded-full font-medium ${className}`} {...props}>
      {children ?? label}
    </span>
  );
}
