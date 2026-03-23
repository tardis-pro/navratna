import React from 'react';

interface GeneralSettingsPortalProps {
  className?: string;
}

export const GeneralSettingsPortal: React.FC<GeneralSettingsPortalProps> = ({ className }) => {
  return (
    <div className={className} style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      <h3 style={{ color: '#fff', marginBottom: '16px' }}>General Settings</h3>
      <p style={{ color: '#888' }}>General settings portal - to be implemented</p>
    </div>
  );
};
