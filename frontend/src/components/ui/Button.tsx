import React, { type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', children, isLoading, variant = 'primary', fullWidth, disabled, ...props }, ref) => {
    
    const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nexus-bg disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'btn-signal focus:ring-nexus-primary',
      secondary: 'bg-transparent text-nexus-text border border-nexus-borderHover hover:bg-white/5 focus:ring-white/30',
      danger: 'bg-nexus-danger text-white hover:opacity-90 focus:ring-nexus-danger',
      ghost: 'bg-transparent text-nexus-muted hover:text-white hover:bg-white/5 focus:ring-white/20'
    };

    const widthClass = fullWidth ? 'w-full' : '';
    const pyClass = 'py-3 px-6';

    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={`${baseStyles} ${variants[variant]} ${widthClass} ${pyClass} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
        {!isLoading && children}
      </button>
    );
  }
);

Button.displayName = 'Button';
