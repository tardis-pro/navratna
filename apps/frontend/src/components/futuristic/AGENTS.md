# futuristic/ — Portal System Infrastructure

⚠️ **Two independent portal systems live here.** Do not confuse them:

| System | Primary file | Connected to TelescopeSurface? | Status |
|--------|-------------|-------------------------------|--------|
| **TelescopeSurface portals** | `../TelescopeSurface/portal_registry.tsx` | **YES** — primary UX | Active |
| **PortalWorkspace** | `PortalWorkspace.tsx` | **NO** — standalone floating-window desktop | Legacy alternative |

## ROOT FILES

| File | Purpose |
|------|---------|
| `Portal.tsx` | Base draggable/resizable window primitive. Props: `id`, `type`, `title`, `children`, `initialPosition`, `zIndex`, `onClose/Maximize/Minimize/Focus`. 8 resize handles. Type-based gradient styling. Framer Motion spring animations. |
| `PortalWorkspace.tsx` | 1804-line standalone workspace: portal lifecycle, system health polling (10s), hotkeys (Alt+1–0), geolocation+weather, minimized-portal bar, `launchPortal`/`closeAllPortals` window event bus. Has its own 26-key `PORTAL_CONFIGS` (different from registry). |
| `PortalManager.tsx` | Alternative workspace with `NeuralConnection` concept (data/control/feedback links). Uses `CommandPalette`. Not used in main routes. |
| `CommandPalette.tsx` | Ctrl+K palette for `PortalManager` (not for `IntentField` — that's separate). |
| `portal_types.ts` | `PortalConfig` interface used by `PortalManager` and `CommandPalette`. |
| `README.md` | Documents the portal system, data sources, context integration. |

## hooks/ SUBDIRECTORY

| Hook | Purpose |
|------|---------|
| `usePortalManager` | Window manager: open/close/minimize/maximize/bringToFront/updatePosition/size. Deduplicates by type. Tracks `portals: Record<string, PortalState>`, `activePortalId`, `nextZIndex`. |
| `useAgents` | Fetches agents from `uaipAPI` with mock fallback (5 agents). NOT the same as `useAgents` from `AgentContext` — this is `futuristic`-local. |
| `useDesktop` | localStorage-persisted: icon positions, recent items (with counts/favorites/pins), preferences, activity events. `getActivityStats()`, `getTrendingItems()`, `searchRecentItems()`. |
| `useDragAndDrop` | Generic drag/drop with drop-zone registration. `useIconDragDrop` extends it for grid-snapping desktop icon placement. |

## desktop/ SUBDIRECTORY

| File | Purpose |
|------|---------|
| `DesktopHeader.tsx` | Top bar: logo, search, notifications, user menu, theme toggle, recent-panel toggle |
| `QuickActionsDock.tsx` | Bottom dock: 5 primary + 2 secondary quick-action buttons, viewport-responsive |
| `ActivityFeed.tsx` | Side panel: Events/Trending/Stats tabs with time-range filter |
| `DesktopIcon.tsx` | Animated icon tile: badge (count/status), keyboard shortcut display, hover/active/pressed states |
| `RecentItemsPanel.tsx` | Slide-in panel: pinned/recent items + search + embedded ActivityFeed |
| `RoleBasedDesktopConfig.tsx` | `DesktopIconConfig[]` per role (guest/user/moderator/admin/system), `getIconsForRole()` |
| `DesktopSettings.tsx` | Settings modal: theme, icon size, animation toggle, grid spacing |
| `DesktopThemes.ts` | `DesktopTheme` interface + preset theme objects (full OKLCH color tokens) |
| `MapWallpaper.tsx` | Animated map/grid background wallpaper component |

## portals/ SUBDIRECTORY

→ See `portals/AGENTS.md` for the full 32-portal reference.

## WHERE TO LOOK

| Task | Location |
|------|---------|
| Add portal to TelescopeSurface | `TelescopeSurface/portal_registry.tsx` (not here) |
| Add floating portal to PortalWorkspace | Add to `PORTAL_CONFIGS` in `PortalWorkspace.tsx` |
| Desktop chrome changes (header/dock) | `desktop/DesktopHeader.tsx`, `desktop/QuickActionsDock.tsx` |
| Portal window chrome (drag/resize) | `Portal.tsx` |
| Role-based desktop icons | `desktop/RoleBasedDesktopConfig.tsx` |

## ANTI-PATTERNS

- `useAgents` in `hooks/useAgents.ts` is NOT `useAgents` from `AgentContext` — different hook, local fetch with mock fallback
- `PortalWorkspace`'s `PORTAL_CONFIGS` has 26 entries including "Coming Soon" stubs — do not rely on these all being implemented
- `PortalManager` + `CommandPalette` are not connected to the main app routes — verify usage before modifying
