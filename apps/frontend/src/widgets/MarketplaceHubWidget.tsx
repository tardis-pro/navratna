import React from 'react';
import { BaseWidget, WidgetProps } from '@uaip/utils/base-widget';
import { MarketplaceHub } from '@/components/marketplace/MarketplaceHub';
import { WidgetCategory, WidgetPermissionLevel } from '@uaip/types/widget';

const MarketplaceHubWidget: React.FC<WidgetProps> = (props) => {
  // Optionally use widget context, props, etc.
  return <MarketplaceHub {...props} />;
};

MarketplaceHubWidget.widgetMeta = {
  id: 'marketplace-hub',
  name: 'Marketplace Hub',
  description: 'Explore agents, battles, leaderboards, and social feed.',
  icon: 'Store', // Optionally use a Lucide icon component reference
  category: WidgetCategory.CORE,
  permissions: [WidgetPermissionLevel.VIEW, WidgetPermissionLevel.INTERACT],
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