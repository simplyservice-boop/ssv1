import React from 'react';
interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string;
  leftIcon?: React.ReactNode; rightIcon?: React.ReactNode;
}
export function Input({ label, error, hint, leftIcon, rightIcon, className='', id, ...props }: Props) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g,'-');
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <div className="relative">
        {leftIcon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">{leftIcon}</div>}
        <input id={inputId} className={`input ${leftIcon?'pl-9':''} ${rightIcon?'pr-9':''} ${error?'border-red-500 focus:border-red-500 focus:ring-red-500/20':''} ${className}`} {...props} />
        {rightIcon && <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">{rightIcon}</div>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
