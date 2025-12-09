import React, { ReactNode, useEffect, useRef, useCallback, Component, ErrorInfo } from 'react';
import {
  BaseWidget,
  WidgetInstance,
  WidgetConfig,
  WidgetError,
  WidgetUsage,
  WidgetPermission,
} from '@uaip/types';

// Widget context for sharing data between parent and widget
export interface WidgetContext {
  widgetId: string;
  instanceId: string;
  userId: string;
  permissions: WidgetPermission[];
  config: WidgetConfig;
  onError: (error: WidgetError) => void;
  onUsage: (usage: WidgetUsage) => void;
  onConfigChange: (config: Partial<WidgetConfig>) => void;
  onRefresh?: () => void;
}

// Props that all widgets receive
export interface BaseWidgetProps {
  context: WidgetContext;
  viewport?: {
    width: number;
    height: number;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
  };
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any; // Allow custom props
}

// Widget lifecycle hooks interface
export interface WidgetLifecycleHooks {
  onMount?: () => void | Promise<void>;
  onUnmount?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onConfigChange?: (config: Partial<WidgetConfig>) => void | Promise<void>;
  onPermissionChange?: (permissions: WidgetPermission[]) => void | Promise<void>;
}

// Widget metadata interface
export interface WidgetMetadata {
  title?: string;
  description?: string;
  version?: string;
}

// Custom hook for widget lifecycle and utilities
export const useWidget = (
  context: WidgetContext,
  lifecycle?: WidgetLifecycleHooks,
  metadata?: WidgetMetadata
) => {
  const startTimeRef = useRef<number>(Date.now());
  const interactionCountRef = useRef<number>(0);
  const previousConfig = useRef<WidgetConfig>(context.config);
  const previousPermissions = useRef<WidgetPermission[]>(context.permissions);

  // Utility function for logging usage
  const logUsage = useCallback(
    (action: WidgetUsage['action'], metadata?: any) => {
      context.onUsage({
        widgetId: context.widgetId,
        instanceId: context.instanceId,
        userId: context.userId,
        action,
        timestamp: new Date(),
        metadata: {
          ...metadata,
          sessionDuration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          interactionCount: interactionCountRef.current,
        },
      });
    },
    [context]
  );

  // Utility function for logging interactions
  const logInteraction = useCallback(
    (action: string = 'interact', metadata?: any) => {
      interactionCountRef.current++;
      logUsage(action as WidgetUsage['action'], metadata);
    },
    [logUsage]
  );

  // Utility function for checking permissions
  const hasPermission = useCallback(
    (permission: WidgetPermission): boolean => {
      return context.permissions.includes(permission);
    },
    [context.permissions]
  );

  // Utility function for reporting errors
  const reportError = useCallback(
    (error: Error, errorInfo?: any) => {
      const widgetError: WidgetError = {
        widgetId: context.widgetId,
        instanceId: context.instanceId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date(),
        userId: context.userId,
        metadata: errorInfo,
      };
      context.onError(widgetError);
    },
    [context]
  );

  // Handle mount
  useEffect(() => {
    logUsage('open');
    lifecycle?.onMount?.();

    // Handle unmount
    return () => {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      logUsage('close', { duration, interactions: interactionCountRef.current });
      lifecycle?.onUnmount?.();
    };
  }, [logUsage, lifecycle]);

  // Handle config changes
  useEffect(() => {
    if (previousConfig.current !== context.config) {
      lifecycle?.onConfigChange?.(context.config);
      previousConfig.current = context.config;
    }
  }, [context.config, lifecycle]);

  // Handle permission changes
  useEffect(() => {
    if (previousPermissions.current !== context.permissions) {
      lifecycle?.onPermissionChange?.(context.permissions);
      previousPermissions.current = context.permissions;
    }
  }, [context.permissions, lifecycle]);

  return {
    logUsage,
    logInteraction,
    hasPermission,
    reportError,
    metadata: metadata || {},
  };
};

// Error fallback component for widgets
interface WidgetErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
  widgetId?: string;
}

const WidgetErrorFallback: React.FC<WidgetErrorFallbackProps> = ({
  error,
  resetErrorBoundary,
  widgetId,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg min-h-[200px]">
      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-lg flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-red-600 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>

      <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Widget Error</h3>

      <p className="text-sm text-red-700 dark:text-red-300 text-center mb-4 max-w-md">
        {widgetId && <span className="font-mono text-xs block mb-2">Widget: {widgetId}</span>}
        {error?.message || 'An unexpected error occurred in this widget.'}
      </p>

      <button
        onClick={resetErrorBoundary}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Retry Widget
      </button>
    </div>
  );
};

// Widget Error Boundary class
interface WidgetErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface WidgetErrorBoundaryProps {
  children: ReactNode;
  context: WidgetContext;
  fallback?: React.ComponentType<WidgetErrorFallbackProps>;
  widgetId: string;
}

class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Widget error in ${this.props.widgetId}:`, error, errorInfo);

    const widgetError: WidgetError = {
      widgetId: this.props.context.widgetId,
      instanceId: this.props.context.instanceId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      timestamp: new Date(),
      userId: this.props.context.userId,
      metadata: errorInfo,
    };

    this.props.context.onError(widgetError);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || WidgetErrorFallback;
      return (
        <FallbackComponent
          error={this.state.error!}
          resetErrorBoundary={this.handleRetry}
          widgetId={this.props.widgetId}
        />
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping widgets with error boundary and common functionality
export interface WithWidgetWrapperProps extends BaseWidgetProps {
  children: ReactNode;
  fallback?: React.ComponentType<WidgetErrorFallbackProps>;
}

export const WithWidgetWrapper: React.FC<WithWidgetWrapperProps> = ({
  children,
  context,
  fallback,
  className = '',
  style = {},
  ...otherProps
}) => {
  return (
    <div
      className={`widget-container ${className}`}
      style={style}
      data-widget-id={context.widgetId}
      data-instance-id={context.instanceId}
      {...otherProps}
    >
      <WidgetErrorBoundary context={context} fallback={fallback} widgetId={context.widgetId}>
        {children}
      </WidgetErrorBoundary>
    </div>
  );
};

// Higher-order component for creating modern widget components
export function createWidget<P extends BaseWidgetProps>(
  WidgetComponent: React.ComponentType<P>,
  metadata?: WidgetMetadata,
  fallback?: React.ComponentType<WidgetErrorFallbackProps>
) {
  const WrappedWidget: React.FC<P> = (props) => {
    return (
      <WithWidgetWrapper {...props} fallback={fallback}>
        <WidgetComponent {...props} />
      </WithWidgetWrapper>
    );
  };

  WrappedWidget.displayName = `Widget(${WidgetComponent.displayName || WidgetComponent.name})`;

  return WrappedWidget;
}

// Export the hook and components for modern widget development
export { useWidget as useWidgetLifecycle };

// Legacy compatibility - keep for gradual migration
export abstract class BaseWidgetComponent<
  P extends BaseWidgetProps = BaseWidgetProps,
  S = {},
> extends React.Component<P, S> {
  // @deprecated Use functional components with useWidget hook instead
  protected getInitialState(): S {
    console.warn(
      'BaseWidgetComponent is deprecated. Use functional components with useWidget hook instead.'
    );
    return {} as S;
  }

  protected renderContent(): ReactNode {
    return null;
  }

  render() {
    return <WithWidgetWrapper {...this.props}>{this.renderContent()}</WithWidgetWrapper>;
  }
}
