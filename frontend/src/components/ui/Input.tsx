import React, { type InputHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="text-label-sm text-nexus-muted">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={`w-full bg-nexus-surface border rounded-card px-4 py-3 text-nexus-text text-body focus:outline-none focus:ring-1 transition-all placeholder:text-nexus-muted/60
              ${error 
                ? 'border-nexus-danger focus:border-nexus-danger focus:ring-nexus-danger' 
                : 'border-nexus-border hover:border-nexus-borderHover focus:border-nexus-primary focus:ring-nexus-primary'
              } ${className}`}
            {...props}
          />
          {error && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <AlertCircle className="w-5 h-5 text-nexus-danger" />
            </div>
          )}
        </div>
        {error && (
          <span className="text-xs text-nexus-danger mt-1 font-medium flex items-center gap-1">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
