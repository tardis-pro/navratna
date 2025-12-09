// Tools & Integrations Portal - DEPRECATED
// This portal has been consolidated into UnifiedToolPortal.tsx
// This file now redirects to the unified interface

import React from 'react';
import UnifiedToolPortal from './UnifiedToolPortal';

export const ToolsIntegrationsPortal: React.FC = () => {
  // Redirect to the unified portal
  return <UnifiedToolPortal />;
};

export default ToolsIntegrationsPortal;
