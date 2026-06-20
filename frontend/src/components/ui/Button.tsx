import React, { type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', children, isLoading, variant = 'primary', fullWidth, disabled, ...props }, ref) => {
    
    const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nexus-bg disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-nexus-primary text-white hover:bg-purple-600 shadow-[0_0_15px_rgba(108,92,231,0.3)] hover:shadow-[0_0_25px_rgba(108,92,231,0.5)] focus:ring-nexus-primary',
      secondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/5 focus:ring-white/30',
      danger: 'bg-nexus-danger/20 text-nexus-danger hover:bg-nexus-danger/30 border border-nexus-danger/30 focus:ring-nexus-danger',
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
