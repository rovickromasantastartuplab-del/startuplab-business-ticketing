
import React from 'react';

export const Badge: React.FC<{
  children: React.ReactNode,
  type?: 'success' | 'danger' | 'warning' | 'info' | 'neutral',
  className?: string
}> = ({ children, type = 'neutral', className = '' }) => {
  const styles = {
    success: 'bg-[#38BDF2]/20 text-[#2E2E2F]',
    danger: 'bg-[#2E2E2F]/10 text-[#2E2E2F]',
    warning: 'bg-[#38BDF2]/20 text-[#2E2E2F]',
    info: 'bg-[#38BDF2]/20 text-[#2E2E2F]',
    neutral: 'bg-[#F2F2F2] text-[#2E2E2F]',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]} ${className}`}>
      {children}
    </span>
  );
};

export const Card: React.FC<{
  children: React.ReactNode,
  className?: string,
  onClick?: () => void
}> = ({ children, className = '', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-[#F2F2F2] rounded-xl border border-[#2E2E2F]/10 overflow-hidden ${className} shadow-none`}
  >
    {children}
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode,
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
  size?: 'sm' | 'md' | 'lg',
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit',
  onClick?: () => void
}> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  onClick
}) => {
    const base = 'inline-flex items-center justify-center font-semibold uppercase tracking-wide rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px]';

    const variants = {
      primary: 'bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] active:bg-[#2E2E2F] focus:ring-[#38BDF2]',
      secondary: 'bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] active:bg-[#2E2E2F] focus:ring-[#38BDF2]',
      outline: 'bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] active:bg-[#2E2E2F] focus:ring-[#38BDF2]',
      ghost: 'bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] active:bg-[#2E2E2F] focus:ring-[#38BDF2]',
      danger: 'bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] active:bg-[#2E2E2F] focus:ring-[#38BDF2]'
    };

    const sizes = {
      sm: 'px-4 py-2 text-[10px]',
      md: 'px-4 py-2 text-[11px]',
      lg: 'px-4 py-2 text-[12px]',
    };

    return (
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      >
        {children}
      </button>
    );
  };

export const Input: React.FC<{
  label?: string;
  error?: string;
  className?: string;
  [key: string]: any;
}> = ({ label, error, className = '', ...props }) => {
  // A caller-supplied className always fully specifies padding/background/border/rounded
  // (every current usage that passes one does), so mixing it with this component's own
  // decorative defaults would leave two conflicting Tailwind utilities (e.g. `rounded-lg`
  // vs a caller's `rounded-[1rem]`) on the element with an unpredictable winner. Only apply
  // the decorative defaults when there's no custom className to conflict with; a custom
  // className still always gets `w-full` (previously silently dropped) plus a non-conflicting
  // error ring (box-shadow, not `border`, so it can't collide with the caller's border color).
  const hasCustomStyling = className.length > 0;
  const base = hasCustomStyling
    ? `block w-full transition-colors font-normal focus:outline-none ${error ? 'ring-2 ring-[#2E2E2F]/40' : ''}`
    : `block w-full px-3 py-2 bg-[#F2F2F2] border ${error ? 'border-[#2E2E2F]' : 'border-[#2E2E2F]/20'} rounded-lg focus:outline-none focus:ring-2 ${error ? 'focus:ring-[#2E2E2F]/40' : 'focus:ring-[#38BDF2]/40'} transition-colors font-normal`;

  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="block text-sm font-medium text-[#2E2E2F]/70">{label}</label>}
      <input className={`${base} ${className}`} {...props} />
      {error && <p className="text-xs text-[#2E2E2F] mt-1">{error}</p>}
    </div>
  );
};

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  showClose?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
  contentClassName?: string;
}> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  footer,
  showClose = true,
  closeOnBackdrop = true,
  className = '',
  contentClassName = ''
}) => {
    if (!isOpen) return null;

    const sizes = {
      sm: 'max-w-md',
      md: 'max-w-xl',
      lg: 'max-w-3xl',
      xl: 'max-w-4xl'
    };

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-[90] bg-[#2E2E2F]/60 transition-opacity"
          onClick={closeOnBackdrop ? onClose : undefined}
        />

        {/* Content */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className={`relative z-[110] bg-[#F2F2F2] rounded-3xl border border-[#2E2E2F]/10 w-full ${sizes[size]
            } max-h-[90vh] overflow-hidden ${className}`}
        >
          <div className="px-6 py-5 border-b border-[#2E2E2F]/10 flex items-start justify-between gap-4 sticky top-0 bg-[#F2F2F2] z-10">
            <div>
              <h2 id="modal-title" className="text-lg sm:text-xl font-bold text-[#2E2E2F]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[11px] uppercase tracking-[0.15em] font-medium text-[#2E2E2F]/60">
                  {subtitle}
                </p>
              )}
            </div>
            {showClose && (
              <button
                onClick={onClose}
                className="min-h-[32px] min-w-[32px] px-2 py-2 rounded-xl bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <div className={`p-6 overflow-y-auto max-h-[70vh] ${contentClassName}`}>
            {children}
          </div>
          {footer && (
            <div className="px-6 py-5 border-t border-[#2E2E2F]/10 bg-[#F2F2F2]">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  };

export const PageLoader: React.FC<{
  label?: string;
  variant?: 'page' | 'section';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({
  label = 'Loading content...',
  variant = 'section',
  size = 'md',
  className = ''
}) => {
    const variants = {
      page: 'min-h-screen bg-[#F2F2F2]',
      section: 'min-h-[60vh] bg-transparent'
    };

    const sizes = {
      sm: 'w-6 h-6',
      md: 'w-8 h-8',
      lg: 'w-10 h-10'
    };

    return (
      <div className={`flex flex-col items-center justify-center text-center ${variants[variant]} ${className}`}>
        <div className={`relative ${sizes[size]}`}>
          <div className="absolute inset-0 rounded-full border border-[#38BDF2]/35" />
          <div className="absolute inset-0 rounded-full border-2 border-[#2E2E2F] border-t-transparent animate-spin" />
          <div className="absolute inset-2 rounded-full bg-[#38BDF2]/10" />
        </div>
        {label && (
          <p className="mt-4 text-[#2E2E2F] font-semibold uppercase tracking-wide text-[10px]">
            {label}
          </p>
        )}
      </div>
    );
  };
