import React, { createElement } from 'react';

interface Props {
  icon?: React.ReactNode | React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: Props) {
  const IconElement = React.isValidElement(icon)
    ? icon
    : typeof icon === 'function'
      ? createElement(icon as React.ElementType, { className: 'w-10 h-10 text-gray-400' })
      : null;

  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
      {IconElement && <div className="bg-gray-100 p-4 rounded-2xl mb-4">{IconElement}</div>}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
