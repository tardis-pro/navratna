import React from 'react';

import { BaseWidgetProps } from '@/components/ui/base-widget';
import { MarketplaceHub } from '@/components/marketplace/MarketplaceHub';
import { WidgetCategory, WidgetPermission } from '@uaip/types/widget';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface WidgetProps extends BaseWidgetProps {
  viewport?: ViewportSize;
  mode?: 'hub' | 'standalone';
}

// Extend React.FC to allow static widgetMeta property
interface WidgetComponent extends React.FC<WidgetProps> {
  widgetMeta?: any;
}

const MarketplaceHubWidget: WidgetComponent = (props) => {
  // Pass through all props including viewport and mode
  return <MarketplaceHub {...props} mode="hub" />;
};

MarketplaceHubWidget.widgetMeta = {
  id: 'marketplace-hub',
  name: 'Marketplace Hub',
  description: 'Explore agents, battles, leaderboards, and social feed.',
  icon: 'Store', // Optionally use a Lucide icon component reference
  category: WidgetCategory.CORE,
  permissions: [WidgetPermission.VIEW, WidgetPermission.INTERACT],
  rbac: {
    roles: ['user', 'admin', 'marketplace-viewer'],
    minSecurityLevel: 1,
  },
  responsive: {
    desktop: { minWidth: 600, minHeight: 400 },
    mobile: { minWidth: 320, minHeight: 400 },
  },
};

export default MarketplaceHubWidget;
