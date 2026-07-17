import React, { Suspense, lazy, useState } from 'react';
import { Settings, User, Server, Database, ShieldCheck } from 'lucide-react';
import { ViewportSize, useViewport } from '@/hooks/use_viewport';
import { cn } from '@/lib/utils';

// Sub-panels are lazy-loaded so only the active tab's portal is mounted.
const GeneralSettingsPortal = lazy(() =>
  import('./GeneralSettingsPortal').then((m) => ({ default: m.GeneralSettingsPortal }))
);
const ProviderSettingsPortal = lazy(() =>
  import('./ProviderSettingsPortal').then((m) => ({ default: m.ProviderSettingsPortal }))
);
const SystemConfigPortal = lazy(() =>
  import('./SystemConfigPortal').then((m) => ({ default: m.SystemConfigPortal }))
);

interface SettingsPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

type SettingsTab = 'general' | 'providers' | 'system' | 'security';

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'general', label: 'General', icon: User },
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'system', label: 'System', icon: Database },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

const TabFallback: React.FC = () => (
  <div className="animate-pulse h-full min-h-40 bg-white/5 rounded-xl" />
);

/**
 * Canonical Settings hub. Collapses the former separate settings surfaces
 * (provider-settings / general-settings / system-config) into one tabbed portal:
 *
 *   - General   → GeneralSettingsPortal (theme / notifications / preferences)
 *   - Providers → ProviderSettingsPortal (LLM provider CRUD + per-task model prefs,
 *                 which itself renders ModelProviderSettings)
 *   - System    → SystemConfigPortal (theme / language / DB / performance)
 *   - Security  → placeholder (no dedicated security-settings component yet;
 *                 the standalone `security` dashboard portal is unchanged)
 */
export const SettingsPortal: React.FC<SettingsPortalProps> = ({ className, viewport }) => {
  const currentViewport = useViewport(viewport);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <div className={cn('flex flex-col h-full', className, currentViewport.isMobile && 'px-1')}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className={cn('font-bold text-white', currentViewport.isMobile ? 'text-base' : 'text-xl')}>
            Settings
          </h1>
          <p className="text-xs text-slate-400">General, providers, system and security</p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-3 border-b border-slate-700/50"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'text-white border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              )}
            >
              <Icon className="w-4 h-4" />
              {!currentViewport.isMobile && <span>{tab.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'general' && <GeneralSettingsPortal />}
          {activeTab === 'providers' && <ProviderSettingsPortal viewport={viewport} />}
          {activeTab === 'system' && <SystemConfigPortal viewport={viewport} />}
          {activeTab === 'security' && (
            <div className="flex flex-col items-center justify-center h-full min-h-40 gap-2 p-6 text-center">
              <ShieldCheck className="w-8 h-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-300">Security settings</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Access, session and policy controls will surface here. Open the Security
                portal for the current security dashboard.
              </p>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default SettingsPortal;
