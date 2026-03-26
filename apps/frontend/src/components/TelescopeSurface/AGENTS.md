# TelescopeSurface/ — Ambient Block Grid + Portal Registry

8 files. The **primary UX surface** of the app. Renders `MaterializableBlock` wrappers sorted by `relevanceScore`. Contains the canonical portal registry (`portal_registry.tsx`).

## FILES

| File | Role |
|------|------|
| `TelescopeSurface.tsx` | Main component + `useTelescopeSurface` hook; owns sorting, visibility derivation, 30s auto-refresh, portal dispatch |
| `portal_registry.tsx` | **Portal hub**: `PORTAL_COMPONENTS` map (21 lazy components) + `createInitialBlocks()` + `renderPortalContent()` |
| `telescope_surface_types.ts` | `ConstellationBlockData`, `ConstellationBlockMetadata` — typed metadata for knowledge-surface blocks |
| `TelescopeKnowledgeSurface.tsx` | Alternate constellation/knowledge-graph surface variant |
| `ConstellationNode.tsx` | Individual node renderer for the knowledge constellation layout |
| `use_constellations.ts` | Fetches + manages constellation block data from `@uaip/types` |
| `use_force_layout.ts` | D3-style force simulation for positioning constellation nodes |
| `index.ts` | Barrel: exports both surfaces, hooks, types |

## PORTAL REGISTRY — HOW IT WORKS

```
PORTAL_COMPONENTS: Record<string, LazyExoticComponent>  // 21 keys
createInitialBlocks(): MaterializableBlockData[]        // sets initial relevanceScore + visibility
renderPortalContent(portalId): ReactNode                // Suspense-wrapped lazy render
```

`TelescopeSurface` calls `renderPortalContent(block.id)` for every block with `type === 'portal'`.

## RELEVANCE CONSTANTS (TelescopeSurface.tsx)

```
RELEVANCE_HIDDEN_THRESHOLD = 0.2   // score < 0.2 → hidden
RELEVANCE_FADED_THRESHOLD  = 0.5   // score < 0.5 → faded
DEFAULT_MAX_VISIBLE_BLOCKS = 4     // attention budget cap
```

`deriveVisibility(score, index, maxVisible)`:
1. `index >= maxVisible` → `hidden` (position cap, regardless of score)
2. `score < 0.2` → `hidden`
3. `score < 0.5` → `faded`
4. else → `visible`

Sorting is by descending `relevanceScore` first — rank 5+ is hidden even with score 0.9.

## INITIAL BLOCK SCORES (createInitialBlocks)

| Score | Portals |
|-------|---------|
| **0.9** | chat, agent-manager, dashboard |
| **0.8** | discussion, discussion-log, discussion-controls, user-chat, consolidated-user-chat |
| **0.75** | knowledge, artifacts, project-management, intelligence-panel |
| **0.6** | settings, security, provider-settings, tools-integrations, tool-management, unified-tool, general-settings |
| **0.4** | system-config, mini-browser |

All start at 400×500 px, 3-col grid, 24px gap/padding via `autoArrangeBlocks()`.

## HOW TO ADD A PORTAL

1. Create `futuristic/portals/MyPortal.tsx` exporting named `MyPortal`
2. Add `const MyPortal = lazy(() => import(...).then(m => ({ default: m.MyPortal })))` to `portal_registry.tsx`
3. Add key to `PORTAL_COMPONENTS`
4. Add entry to `createInitialBlocks()` with a `relevanceScore` (0.9=visible, 0.6=faded, 0.4=hidden)

## DYNAMIC RELEVANCE

From `useTelescopeSurface`: `updateRelevance(id, score)` clamps to [0,1], re-runs `applyRules()` (re-sorts + re-derives visibility for all blocks). Called externally to surface contextual portals.

## ANTI-PATTERNS

- Adding portal components directly to this directory — portals live in `futuristic/portals/`
- Registering a portal without a `createInitialBlocks()` entry — block won't appear in the surface
- `DiscussionPortal` is registered here (`discussion` key) but its file lives at `components/DiscussionPortal.tsx` — not in `futuristic/portals/`
