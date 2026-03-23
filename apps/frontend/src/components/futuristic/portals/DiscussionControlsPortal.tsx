import React from 'react';

interface DiscussionControlsPortalProps {
  className?: string;
}

export const DiscussionControlsPortal: React.FC<DiscussionControlsPortalProps> = ({ className }) => {
  return (
    <div className={className} style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      <h3 style={{ color: '#fff', marginBottom: '16px' }}>Discussion Controls</h3>
      <p style={{ color: '#888' }}>Discussion controls portal - to be implemented</p>
    </div>
  );
};
