import React, { Component, ErrorInfo, ReactNode } from 'react';
import { WidgetConfig, WidgetError, WidgetUsage, WidgetPermission } from '@uaip/types';
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
  [key: string]: any;
}
export interface WidgetLifecycle {
  onMount?(): void | Promise<void>;
  onUnmount?(): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
  onConfigChange?(config: Partial<WidgetConfig>): void | Promise<void>;
  onPermissionChange?(permissions: WidgetPermission[]): void | Promise<void>;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}
export declare abstract class BaseWidgetComponent<
  P extends BaseWidgetProps = BaseWidgetProps,
  S = {},
>
  extends Component<P, S & ErrorBoundaryState>
  implements WidgetLifecycle
{
  private startTime;
  private interactionCount;
  constructor(props: P);
  protected abstract getInitialState(): S;
  protected abstract renderContent(): ReactNode;
  protected getWidgetMetadata(): {
    title?: string;
    description?: string;
    version?: string;
  };
  componentDidMount(): void;
  componentWillUnmount(): void;
  componentDidUpdate(prevProps: P): void;
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState>;
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
  onMount?(): void | Promise<void>;
  onUnmount?(): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
  onConfigChange?(config: WidgetConfig): void | Promise<void>;
  onPermissionChange?(permissions: WidgetPermission[]): void | Promise<void>;
  protected hasPermission(permission: WidgetPermission): boolean;
  protected logInteraction(action?: string, metadata?: any): void;
  protected logUsage(action: WidgetUsage['action'], metadata?: any): void;
  protected reportError(error: Error, errorInfo?: ErrorInfo): void;
  protected getErrorSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical';
  protected updateConfig(updates: Partial<WidgetConfig>): void;
  protected refresh(): void;
  render(): ReactNode;
  private renderError;
}
export interface FunctionalWidgetProps extends BaseWidgetProps {
  children?: ReactNode;
}
export declare const withWidgetContext: <P extends object>(
  WrappedComponent: React.ComponentType<P & BaseWidgetProps>
) => React.ForwardRefExoticComponent<
  React.PropsWithoutRef<P & BaseWidgetProps> & React.RefAttributes<any>
>;
export declare const useWidget: (context: WidgetContext) => {
  hasPermission: (permission: WidgetPermission) => boolean;
  logInteraction: (action?: string, metadata?: any) => void;
  updateConfig: (updates: Partial<WidgetConfig>) => void;
  refresh: () => void;
  reportError: (error: Error) => void;
};
export {};
//# sourceMappingURL=base-widget.d.ts.map
