import React from 'react';
import { motion } from 'framer-motion';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface PortalContainerProps {
  children: React.ReactNode;
  className?: string;
  isMobile?: boolean;
}

export const PortalContainer: React.FC<PortalContainerProps> = ({ children, className, isMobile }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`space-y-6 ${className ?? ''} ${isMobile ? 'px-2' : ''}`}
  >
    {children}
  </motion.div>
);

interface PortalConnectionBadgeProps {
  isConnected: boolean;
  onRefresh?: () => void;
  refreshTitle?: string;
  label?: string;
  refreshIcon?: React.ReactNode;
}

export const PortalConnectionBadge: React.FC<PortalConnectionBadgeProps> = ({
  isConnected,
  onRefresh,
  refreshTitle,
  label,
  refreshIcon,
}) => (
  <>
    <div className="flex items-center space-x-2">
      <div
        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
      />
      <span className="text-sm text-gray-500">
        {isConnected ? 'Live' : 'Offline'}
        {label}
      </span>
    </div>
    {onRefresh && (
      <button
        onClick={onRefresh}
        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        title={refreshTitle}
      >
        {refreshIcon ?? <ArrowPathIcon className="w-4 h-4" />}
      </button>
    )}
  </>
);

interface PortalLoadingStateProps {
  message: string;
  icon?: React.ReactNode;
}

export const PortalLoadingState: React.FC<PortalLoadingStateProps> = ({ message, icon }) => (
  <div className="flex items-center justify-center h-32">
    <div className="text-center">
      {icon ?? <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />}
      <p className="text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  </div>
);

interface PortalEmptyStateProps {
  icon: React.ReactNode;
  message: string;
  subMessage?: string;
  onRefresh?: () => void;
  refreshLabel?: string;
}

export const PortalEmptyState: React.FC<PortalEmptyStateProps> = ({
  icon,
  message,
  subMessage,
  onRefresh,
  refreshLabel,
}) => (
  <div className="flex items-center justify-center h-32">
    <div className="text-center">
      {icon}
      <p className="text-gray-500 dark:text-gray-400">{message}</p>
      {subMessage && <p className="text-sm text-gray-400 dark:text-gray-500">{subMessage}</p>}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          {refreshLabel ?? 'Refresh'}
        </button>
      )}
    </div>
  </div>
);

interface PortalErrorStateProps {
  message: string;
  detail?: string;
  onRetry: () => void;
}

export const PortalErrorState: React.FC<PortalErrorStateProps> = ({
  message,
  detail,
  onRetry,
}) => (
  <div className="flex items-center justify-center h-32">
    <div className="text-center">
      <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p className="text-red-500 dark:text-red-400">{message}</p>
      {detail && <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{detail}</p>}
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Try Again
      </button>
    </div>
  </div>
);

interface PortalHeaderProps {
  icon: React.ReactNode;
  title: string;
  isConnected: boolean;
  onRefresh: () => void;
  refreshTitle?: string;
  connectionLabel?: string;
  lastUpdated?: Date | null;
  extraControls?: React.ReactNode;
}

export const PortalHeader: React.FC<PortalHeaderProps> = ({
  icon,
  title,
  isConnected,
  onRefresh,
  refreshTitle,
  connectionLabel,
  lastUpdated,
  extraControls,
}) => (
  <div className="flex items-center justify-between">
    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
      {icon}
      {title}
    </h2>
    <div className="flex items-center space-x-4">
      {extraControls}
      <PortalConnectionBadge
        isConnected={isConnected}
        onRefresh={onRefresh}
        refreshTitle={refreshTitle}
        label={connectionLabel}
      />
      {lastUpdated && (
        <span className="text-xs text-gray-400">
          Updated: {lastUpdated.toLocaleTimeString()}
        </span>
      )}
    </div>
  </div>
);

interface PortalSearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchIcon?: React.ReactNode;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export const PortalSearchFilter: React.FC<PortalSearchFilterProps> = ({
  value,
  onChange,
  placeholder,
  searchIcon,
  categories,
  selectedCategory,
  onCategoryChange,
}) => (
  <div className="flex flex-col sm:flex-row gap-4">
    <div className="flex-1 relative">
      {searchIcon}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${searchIcon ? 'pl-10' : 'pl-4'} pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
      />
    </div>
    <select
      value={selectedCategory}
      onChange={(e) => onCategoryChange(e.target.value)}
      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      {categories.map((category) => (
        <option key={category} value={category}>
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </option>
      ))}
    </select>
  </div>
);

interface PortalDetailCardProps {
  name: string;
  subtitle: string;
  badge: React.ReactNode;
  description?: string;
  children?: React.ReactNode;
}

export const PortalDetailCard: React.FC<PortalDetailCardProps> = ({
  name,
  subtitle,
  badge,
  description,
  children,
}) => (
  <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
    <div className="flex items-start justify-between mb-3">
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-white">{name}</h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {badge}
    </div>
    {description && (
      <p className="text-gray-600 dark:text-gray-400 mb-4">{description}</p>
    )}
    {children}
  </div>
);
