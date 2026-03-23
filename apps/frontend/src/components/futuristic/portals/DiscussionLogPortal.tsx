import React from 'react';

interface DiscussionLogPortalProps {
  className?: string;
}

export const DiscussionLogPortal: React.FC<DiscussionLogPortalProps> = ({ className }) => {
  return (
    <div className={className} style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      <h3 style={{ color: '#fff', marginBottom: '16px' }}>Discussion Log</h3>
      <p style={{ color: '#888' }}>Discussion log portal - to be implemented</p>
    </div>
  );
};
