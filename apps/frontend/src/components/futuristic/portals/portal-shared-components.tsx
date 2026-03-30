import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Portal Container ─────────────────────────────────────────

interface PortalContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const PortalContainer: React.FC<PortalContainerProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'h-full flex flex-col overflow-hidden',
      'bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/80',
      'backdrop-blur-xl rounded-2xl border border-slate-700/50',
      className,
    )}
  >
    {children}
  </div>
);

// ── Portal Header ────────────────────────────────────────────

interface PortalHeaderProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  isConnected?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PortalHeader: React.FC<PortalHeaderProps> = ({
  icon,
  title,
  description,
  isConnected,
  onRefresh,
  isRefreshing,
  badge,
  actions,
}) => (
  <div className="flex-shrink-0 p-4 md:p-5 border-b border-slate-700/50">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100 truncate">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-slate-400 truncate">{description}</p>
          )}
        </div>
        {badge}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isConnected !== undefined && (
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isConnected ? 'bg-emerald-400' : 'bg-slate-500',
              )}
            />
            <span className="text-xs text-slate-400">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh data"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          </button>
        )}
        {actions}
      </div>
    </div>
  </div>
);

// ── Portal Body ──────────────────────────────────────────────

interface PortalBodyProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const PortalBody: React.FC<PortalBodyProps> = ({
  children,
  className,
  noPadding,
}) => (
  <div className={cn('flex-1 overflow-auto min-h-0', !noPadding && 'p-4 md:p-5', className)}>
    {children}
  </div>
);

// ── Connection Badge (standalone) ────────────────────────────

interface PortalConnectionBadgeProps {
  isConnected: boolean;
  label?: string;
}

export const PortalConnectionBadge: React.FC<PortalConnectionBadgeProps> = ({
  isConnected,
  label,
}) => (
  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-700/60 bg-slate-800/60">
    <div
      className={cn(
        'w-1.5 h-1.5 rounded-full',
        isConnected ? 'bg-emerald-400' : 'bg-slate-500',
      )}
    />
    <span className="text-xs text-slate-300">
      {label ?? (isConnected ? 'Live' : 'Offline')}
    </span>
  </div>
);

// ── Loading State ────────────────────────────────────────────

interface PortalLoadingStateProps {
  message?: string;
}

export const PortalLoadingState: React.FC<PortalLoadingStateProps> = ({
  message = 'Loading…',
}) => (
  <div className="flex-1 flex items-center justify-center p-8" role="status" aria-live="polite">
    <div className="text-center space-y-3">
      <Loader2 className="w-6 h-6 text-slate-400 mx-auto animate-spin" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  </div>
);

// ── Skeleton Loader ──────────────────────────────────────────

interface PortalSkeletonProps {
  rows?: number;
  className?: string;
}

export const PortalSkeleton: React.FC<PortalSkeletonProps> = ({
  rows = 3,
  className,
}) => (
  <div className={cn('space-y-3 animate-pulse', className)} role="status" aria-label="Loading content">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-800/70 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded bg-slate-800/70" style={{ width: `${70 + (i * 10) % 30}%` }} />
          <div className="h-2.5 rounded bg-slate-800/50" style={{ width: `${40 + (i * 15) % 40}%` }} />
        </div>
      </div>
    ))}
  </div>
);

// ── Empty State ──────────────────────────────────────────────

interface PortalEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const PortalEmptyState: React.FC<PortalEmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center space-y-3 max-w-xs">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-500">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-300">{title}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  </div>
);

// ── Error State ──────────────────────────────────────────────

interface PortalErrorStateProps {
  message?: string;
  detail?: string;
  onRetry?: () => void;
}

export const PortalErrorState: React.FC<PortalErrorStateProps> = ({
  message = 'Something went wrong',
  detail,
  onRetry,
}) => (
  <div className="flex-1 flex items-center justify-center p-8" role="alert">
    <div className="text-center space-y-3 max-w-xs">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-red-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-200">{message}</p>
        {detail && (
          <p className="text-xs text-slate-500 mt-1 break-words">{detail}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Try again
        </button>
      )}
    </div>
  </div>
);

// ── Inline Error Banner ──────────────────────────────────────

interface PortalErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export const PortalErrorBanner: React.FC<PortalErrorBannerProps> = ({
  message,
  onDismiss,
}) => (
  <div className="mx-4 mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 flex items-center gap-2" role="alert">
    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
    <p className="text-xs text-red-300 flex-1 min-w-0 truncate">{message}</p>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-300 text-xs flex-shrink-0"
        aria-label="Dismiss error"
      >
        ✕
      </button>
    )}
  </div>
);

// ── Search + Filter Bar ──────────────────────────────────────

interface PortalSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const PortalSearchBar: React.FC<PortalSearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search…',
  searchIcon,
  children,
}) => (
  <div className="flex gap-2">
    <div className="flex-1 relative">
      {searchIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          {searchIcon}
        </div>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-xl border border-slate-700/60 bg-slate-900/50',
          'py-2 pr-3 text-sm text-slate-100 placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/40',
          'transition-colors',
          searchIcon ? 'pl-9' : 'pl-3',
        )}
      />
    </div>
    {children}
  </div>
);

// ── Stat Card ────────────────────────────────────────────────

interface PortalStatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export const PortalStatCard: React.FC<PortalStatCardProps> = ({
  label,
  value,
  icon,
  trend,
  trendType = 'neutral',
  className,
}) => (
  <div
    className={cn(
      'rounded-xl border border-slate-700/50 bg-slate-800/40 p-3',
      'transition-colors hover:bg-slate-800/60',
      className,
    )}
  >
    <div className="flex items-center justify-between mb-2">
      {icon && (
        <div className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      {trend && (
        <span
          className={cn(
            'text-xs',
            trendType === 'positive' && 'text-emerald-400',
            trendType === 'negative' && 'text-red-400',
            trendType === 'neutral' && 'text-slate-500',
          )}
        >
          {trend}
        </span>
      )}
    </div>
    <p className="text-lg font-semibold text-slate-100">{value}</p>
    <p className="text-xs text-slate-400 mt-0.5">{label}</p>
  </div>
);

// ── Detail Card ──────────────────────────────────────────────

interface PortalDetailCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export const PortalDetailCard: React.FC<PortalDetailCardProps> = ({
  children,
  className,
  onClick,
  selected,
}) => (
  <div
    className={cn(
      'rounded-xl border bg-slate-900/40 p-3 transition-colors',
      onClick && 'cursor-pointer',
      selected
        ? 'border-cyan-500/40 ring-1 ring-cyan-500/20 bg-cyan-500/5'
        : 'border-slate-700/50 hover:bg-slate-800/50',
      className,
    )}
    onClick={onClick}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    {children}
  </div>
);

// ── Status Badge ─────────────────────────────────────────────

interface PortalStatusBadgeProps {
  status: 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
  label: string;
  className?: string;
}

const statusStyles: Record<PortalStatusBadgeProps['status'], string> = {
  healthy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  info: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  neutral: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
};

export const PortalStatusBadge: React.FC<PortalStatusBadgeProps> = ({
  status,
  label,
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border',
      statusStyles[status],
      className,
    )}
  >
    {label}
  </span>
);
