import React, { Component, ErrorInfo, ReactNode } from 'react';
import { 
  BaseWidget, 
  WidgetInstance, 
  WidgetConfig, 
  WidgetError, 
  WidgetUsage,
  WidgetPermission 
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

// Widget lifecycle methods interface
export interface WidgetLifecycle {
  onMount?(): void | Promise<void>;
  onUnmount?(): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
  onConfigChange?(config: Partial<WidgetConfig>): void | Promise<void>;
  onPermissionChange?(permissions: WidgetPermission[]): void | Promise<void>;
}

// Error boundary state
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// Base widget class that provides common functionality
export abstract class BaseWidgetComponent<P extends BaseWidgetProps = BaseWidgetProps, S = {}> 
  extends Component<P, S & ErrorBoundaryState> 
  implements WidgetLifecycle {
  
  private startTime: number = Date.now();
  private interactionCount: number = 0;

  constructor(props: P) {
    super(props);
    this.state = {
      ...this.getInitialState(),
      hasError: false
    } as S & ErrorBoundaryState;
  }

  // Abstract method for initial state - must be implemented by subclasses
  protected abstract getInitialState(): S;

  // Abstract method for rendering widget content - must be implemented by subclasses
  protected abstract renderContent(): ReactNode;

  // Optional widget metadata - can be overridden by subclasses
  protected getWidgetMetadata(): {
    title?: string;
    description?: string;
    version?: string;
  } {
    return {};
  }

  // Component lifecycle methods
  componentDidMount(): void {
    this.logUsage('open');
    this.onMount?.();
  }

  componentWillUnmount(): void {
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    this.logUsage('close', { duration, interactions: this.interactionCount });
    this.onUnmount?.();
  }

  componentDidUpdate(prevProps: P): void {
    // Handle config changes
    if (prevProps.context.config !== this.props.context.config) {
      this.onConfigChange?.(this.props.context.config);
    }

    // Handle permission changes
    if (prevProps.context.permissions !== this.props.context.permissions) {
      this.onPermissionChange?.(this.props.context.permissions);
    }
  }

  // Error boundary methods
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo });
    this.reportError(error, errorInfo);
  }

  // Widget lifecycle methods (can be overridden by subclasses)
  onMount?(): void | Promise<void>;
  onUnmount?(): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
  onConfigChange?(config: WidgetConfig): void | Promise<void>;
  onPermissionChange?(permissions: WidgetPermission[]): void | Promise<void>;

  // Utility methods available to all widgets
  protected hasPermission(permission: WidgetPermission): boolean {
    return this.props.context.permissions.includes(permission);
  }

  protected logInteraction(action: string = 'interact', metadata?: any): void {
    this.interactionCount++;
    this.logUsage(action, metadata);
  }

  protected logUsage(action: WidgetUsage['action'], metadata?: any): void {
    this.props.context.onUsage({
      widgetId: this.props.context.widgetId,
      userId: this.props.context.userId,
      action,
      sessionId: this.props.context.instanceId,
      metadata,
      timestamp: new Date()
    });
  }

  protected reportError(error: Error, errorInfo?: ErrorInfo): void {
    const widgetError: WidgetError = {
      widgetId: this.props.context.widgetId,
      instanceId: this.props.context.instanceId,
      userId: this.props.context.userId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      },
      context: {
        userAgent: navigator.userAgent,
        viewport: this.props.viewport ? {
          width: this.props.viewport.width,
          height: this.props.viewport.height
        } : undefined,
        url: window.location.href,
        timestamp: new Date()
      },
      severity: this.getErrorSeverity(error),
      resolved: false
    };

    this.props.context.onError(widgetError);
  }

  protected getErrorSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    // Basic error severity classification
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return 'high';
    }
    if (error.name === 'NetworkError' || error.message.includes('fetch')) {
      return 'medium';
    }
    return 'low';
  }

  protected updateConfig(updates: Partial<WidgetConfig>): void {
    this.props.context.onConfigChange(updates);
  }

  protected refresh(): void {
    this.props.context.onRefresh?.();
    this.onRefresh?.();
  }

  // Render method
  render(): ReactNode {
    if (this.state.hasError) {
      return this.renderError();
    }

    return (
      <div 
        className={`widget-container ${this.props.className || ''}`}
        style={this.props.style}
        data-widget-id={this.props.context.widgetId}
        data-instance-id={this.props.context.instanceId}
      >
        {this.renderContent()}
      </div>
    );
  }

  // Error rendering
  private renderError(): ReactNode {
    return (
      <div className="widget-error-boundary">
        <div className="error-content">
          <h3>Something went wrong</h3>
          <p>This widget encountered an error and couldn't be displayed.</p>
          <details>
            <summary>Error Details</summary>
            <pre>{this.state.error?.stack}</pre>
          </details>
          <button 
            onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
            className="retry-button"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}

// Functional widget component base (for hooks-based widgets)
export interface FunctionalWidgetProps extends BaseWidgetProps {
  children?: ReactNode;
}

export const withWidgetContext = <P extends object>(
  WrappedComponent: React.ComponentType<P & BaseWidgetProps>
) => {
  return React.forwardRef<any, P & BaseWidgetProps>((props, ref) => {
    const startTime = React.useRef(Date.now());
    const interactionCount = React.useRef(0);

    // Lifecycle effects
    React.useEffect(() => {
      // Mount
      props.context.onUsage({
        widgetId: props.context.widgetId,
        userId: props.context.userId,
        action: 'open',
        sessionId: props.context.instanceId,
        timestamp: new Date()
      });

      // Unmount
      return () => {
        const duration = Math.floor((Date.now() - startTime.current) / 1000);
        props.context.onUsage({
          widgetId: props.context.widgetId,
          userId: props.context.userId,
          action: 'close',
          sessionId: props.context.instanceId,
          duration,
          metadata: { interactions: interactionCount.current },
          timestamp: new Date()
        });
      };
    }, []);

    // Error boundary for functional components
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
      if (error) {
        const widgetError: WidgetError = {
          widgetId: props.context.widgetId,
          instanceId: props.context.instanceId,
          userId: props.context.userId,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          context: {
            userAgent: navigator.userAgent,
            viewport: props.viewport ? {
              width: props.viewport.width,
              height: props.viewport.height
            } : undefined,
            url: window.location.href,
            timestamp: new Date()
          },
          severity: 'medium',
          resolved: false
        };

        props.context.onError(widgetError);
      }
    }, [error]);

    // Utility functions
    const hasPermission = (permission: WidgetPermission): boolean => {
      return props.context.permissions.includes(permission);
    };

    const logInteraction = (action: string = 'interact', metadata?: any): void => {
      interactionCount.current++;
      props.context.onUsage({
        widgetId: props.context.widgetId,
        userId: props.context.userId,
        action: action as WidgetUsage['action'],
        sessionId: props.context.instanceId,
        metadata,
        timestamp: new Date()
      });
    };

    const updateConfig = (updates: Partial<WidgetConfig>): void => {
      props.context.onConfigChange(updates);
    };

    const refresh = (): void => {
      props.context.onRefresh?.();
    };

    // Enhanced props with utility functions
    const enhancedProps = {
      ...props,
      hasPermission,
      logInteraction,
      updateConfig,
      refresh,
      setError
    };

    if (error) {
      return (
        <div className="widget-error-boundary">
          <div className="error-content">
            <h3>Something went wrong</h3>
            <p>This widget encountered an error and couldn't be displayed.</p>
            <button onClick={() => setError(null)} className="retry-button">
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div 
        className={`widget-container ${props.className || ''}`}
        style={props.style}
        data-widget-id={props.context.widgetId}
        data-instance-id={props.context.instanceId}
      >
        <WrappedComponent {...enhancedProps} ref={ref} />
      </div>
    );
  });
};

// Hook for widget utilities in functional components
export const useWidget = (context: WidgetContext) => {
  const interactionCount = React.useRef(0);

  const hasPermission = React.useCallback((permission: WidgetPermission): boolean => {
    return context.permissions.includes(permission);
  }, [context.permissions]);

  const logInteraction = React.useCallback((action: string = 'interact', metadata?: any): void => {
    interactionCount.current++;
    context.onUsage({
      widgetId: context.widgetId,
      userId: context.userId,
      action: action as WidgetUsage['action'],
      sessionId: context.instanceId,
      metadata,
      timestamp: new Date()
    });
  }, [context]);

  const updateConfig = React.useCallback((updates: Partial<WidgetConfig>): void => {
    context.onConfigChange(updates);
  }, [context]);

  const refresh = React.useCallback((): void => {
    context.onRefresh?.();
  }, [context]);

  const reportError = React.useCallback((error: Error): void => {
    const widgetError: WidgetError = {
      widgetId: context.widgetId,
      instanceId: context.instanceId,
      userId: context.userId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date()
      },
      severity: 'medium',
      resolved: false
    };

    context.onError(widgetError);
  }, [context]);

  return {
    hasPermission,
    logInteraction,
    updateConfig,
    refresh,
    reportError
  };
}; 