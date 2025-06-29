import React, { Component } from 'react';
// Base widget class that provides common functionality
export class BaseWidgetComponent extends Component {
    constructor(props) {
        super(props);
        this.startTime = Date.now();
        this.interactionCount = 0;
        this.state = {
            ...this.getInitialState(),
            hasError: false
        };
    }
    // Optional widget metadata - can be overridden by subclasses
    getWidgetMetadata() {
        return {};
    }
    // Component lifecycle methods
    componentDidMount() {
        this.logUsage('open');
        this.onMount?.();
    }
    componentWillUnmount() {
        const duration = Math.floor((Date.now() - this.startTime) / 1000);
        this.logUsage('close', { duration, interactions: this.interactionCount });
        this.onUnmount?.();
    }
    componentDidUpdate(prevProps) {
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
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        this.reportError(error, errorInfo);
    }
    // Utility methods available to all widgets
    hasPermission(permission) {
        return this.props.context.permissions.includes(permission);
    }
    logInteraction(action = 'interact', metadata) {
        this.interactionCount++;
        this.logUsage(action, metadata);
    }
    logUsage(action, metadata) {
        this.props.context.onUsage({
            widgetId: this.props.context.widgetId,
            userId: this.props.context.userId,
            action,
            sessionId: this.props.context.instanceId,
            metadata,
            timestamp: new Date()
        });
    }
    reportError(error, errorInfo) {
        const widgetError = {
            widgetId: this.props.context.widgetId,
            instanceId: this.props.context.instanceId,
            userId: this.props.context.userId,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
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
    getErrorSeverity(error) {
        // Basic error severity classification
        if (error.name === 'TypeError' || error.name === 'ReferenceError') {
            return 'high';
        }
        if (error.name === 'NetworkError' || error.message.includes('fetch')) {
            return 'medium';
        }
        return 'low';
    }
    updateConfig(updates) {
        this.props.context.onConfigChange(updates);
    }
    refresh() {
        this.props.context.onRefresh?.();
        this.onRefresh?.();
    }
    // Render method
    render() {
        if (this.state.hasError) {
            return this.renderError();
        }
        return (<div className={`widget-container ${this.props.className || ''}`} style={this.props.style} data-widget-id={this.props.context.widgetId} data-instance-id={this.props.context.instanceId}>
        {this.renderContent()}
      </div>);
    }
    // Error rendering
    renderError() {
        return (<div className="widget-error-boundary">
        <div className="error-content">
          <h3>Something went wrong</h3>
          <p>This widget encountered an error and couldn't be displayed.</p>
          <details>
            <summary>Error Details</summary>
            <pre>{this.state.error?.stack}</pre>
          </details>
          <button onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })} className="retry-button">
            Try Again
          </button>
        </div>
      </div>);
    }
}
export const withWidgetContext = (WrappedComponent) => {
    return React.forwardRef((props, ref) => {
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
        const [error, setError] = React.useState(null);
        React.useEffect(() => {
            if (error) {
                const widgetError = {
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
        const hasPermission = (permission) => {
            return props.context.permissions.includes(permission);
        };
        const logInteraction = (action = 'interact', metadata) => {
            interactionCount.current++;
            props.context.onUsage({
                widgetId: props.context.widgetId,
                userId: props.context.userId,
                action: action,
                sessionId: props.context.instanceId,
                metadata,
                timestamp: new Date()
            });
        };
        const updateConfig = (updates) => {
            props.context.onConfigChange(updates);
        };
        const refresh = () => {
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
            return (<div className="widget-error-boundary">
          <div className="error-content">
            <h3>Something went wrong</h3>
            <p>This widget encountered an error and couldn't be displayed.</p>
            <button onClick={() => setError(null)} className="retry-button">
              Try Again
            </button>
          </div>
        </div>);
        }
        return (<div className={`widget-container ${props.className || ''}`} style={props.style} data-widget-id={props.context.widgetId} data-instance-id={props.context.instanceId}>
        <WrappedComponent {...enhancedProps} ref={ref}/>
      </div>);
    });
};
// Hook for widget utilities in functional components
export const useWidget = (context) => {
    const interactionCount = React.useRef(0);
    const hasPermission = React.useCallback((permission) => {
        return context.permissions.includes(permission);
    }, [context.permissions]);
    const logInteraction = React.useCallback((action = 'interact', metadata) => {
        interactionCount.current++;
        context.onUsage({
            widgetId: context.widgetId,
            userId: context.userId,
            action: action,
            sessionId: context.instanceId,
            metadata,
            timestamp: new Date()
        });
    }, [context]);
    const updateConfig = React.useCallback((updates) => {
        context.onConfigChange(updates);
    }, [context]);
    const refresh = React.useCallback(() => {
        context.onRefresh?.();
    }, [context]);
    const reportError = React.useCallback((error) => {
        const widgetError = {
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
//# sourceMappingURL=base-widget.js.map