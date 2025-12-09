import React from 'react';
import { PortalWorkspace } from '../components/futuristic/PortalWorkspace';

export const FuturisticDemo: React.FC = () => {
  return (
    <div className="relative w-full h-screen">
      {/* Real Portal Workspace with Live Data */}
      <PortalWorkspace />

      {/* Instructions Overlay */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/10 max-w-md text-center">
          <h3 className="text-white font-semibold mb-2">🚀 Live Portal System</h3>
          <div className="text-white/70 text-sm space-y-1">
            <p>• Click left sidebar icons to toggle portals</p>
            <p>• Drag headers to move • Hover edges to resize</p>
            <p>• All data is live from your application</p>
            <p>• Create agents to see real functionality</p>
          </div>
        </div>
      </div>
    </div>
  );
};
