# Frontend Legacy Component Cleanup - Implementation Plan

> **For Claude/Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove ~10,000 lines of dead code, fix broken imports, and reduce technical debt in the frontend codebase.

**Context:** The codebase has undergone a paradigm shift: `Desktop.tsx` → `DesktopUnified.tsx` → **TelescopeSurface** (current primary interface). `DesktopUnified.tsx` has been **deleted** (2026-03-21). The Telescope paradigm — intent-driven, spatial, relevance-scored — replaces all traditional navigation. This plan targets orphaned components from earlier architectures. See `apps/frontend/docs/VISION.md` for the current frontend vision.

**Updated:** 2026-03-30 — Reflects DesktopUnified deletion and TelescopeSurface as primary UI.

**Verification Protocol:**
Before ANY deletion, the agent must execute the **Proof Command** listed for the task.

1.  **Positive Proof:** The component file MUST exist.
2.  **Negative Proof:** The component MUST NOT be imported by any active file (excluding itself and tests).
3.  **Build Check:** After deletion, `pnpm build` must pass.

---

## Sprint Overview

| Sprint       | Focus                           | Risk   | Estimated Tasks | Lines Removed |
| ------------ | ------------------------------- | ------ | --------------- | ------------- |
| **Sprint 1** | Debug/Test Component Cleanup    | LOW    | 7               | ~500          |
| **Sprint 2** | Unused Workspace Components     | LOW    | 5               | ~1,200        |
| **Sprint 3** | Duplicate Portal Cleanup        | MEDIUM | 7               | ~2,500        |
| **Sprint 4** | Unused Feature Components       | MEDIUM | 11              | ~3,500        |
| **Sprint 5** | Fix Broken Import (DebateArena) | HIGH   | 1               | N/A           |
| **Sprint 6** | Superseded Component Removal    | MEDIUM | 2 (1 done)      | ~2,400        |

**Total Estimated Removal:** ~10,100 lines of dead code

> **Note (2026-03-30):** Task 6.1 (Desktop.tsx removal) is COMPLETED — both Desktop.tsx and DesktopUnified.tsx were deleted when TelescopeSurface became the primary UI. Verify remaining tasks against `portal_registry.tsx` for current active components.

---

## Sprint 1: Debug/Test Component Cleanup (LOW RISK)

**Goal:** Remove development-only debug and test components that should never be in production.

### Task 1.1: Remove AuthDebug.tsx

**Proof of Obsolescence:**

```bash
# Must return ONLY the file itself
grep -r "AuthDebug" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/AuthDebug.tsx`

**Verification:**

- Run `pnpm build`

### Task 1.2: Remove WebSocketTest.tsx

**Proof of Obsolescence:**

```bash
grep -r "WebSocketTest" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/WebSocketTest.tsx`

**Verification:**

- Run `pnpm build`

### Task 1.3: Remove ThinkingIndicator.tsx

**Proof of Obsolescence:**

```bash
grep -r "ThinkingIndicator" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/ThinkingIndicator.tsx`

**Verification:**

- Run `pnpm build`

### Task 1.4: Remove ThoughtProcess.tsx

**Proof of Obsolescence:**

```bash
grep -r "ThoughtProcess" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/ThoughtProcess.tsx`

**Verification:**

- Run `pnpm build`

### Task 1.5: Remove DecisionLog.tsx

**Proof of Obsolescence:**

```bash
grep -r "DecisionLog" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/DecisionLog.tsx`

**Verification:**

- Run `pnpm build`

### Task 1.6: Remove FocusableWrapper.tsx

**Proof of Obsolescence:**

```bash
grep -r "FocusableWrapper" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/FocusableWrapper.tsx`

**Verification:**

- Run `pnpm build`

### Task 1.7: Remove ToolUsageIndicator.tsx

**Proof of Obsolescence:**

```bash
grep -r "ToolUsageIndicator" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/ToolUsageIndicator.tsx`

**Verification:**

- Run `pnpm build`

---

## Sprint 2: Unused Workspace Components (LOW RISK)

**Goal:** Remove experimental workspace layouts that were never integrated.

### Task 2.1: Remove CleanWorkspace.tsx

**Proof of Obsolescence:**

```bash
grep -r "CleanWorkspace" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/CleanWorkspace.tsx`

### Task 2.2: Remove SimpleWorkspace.tsx

**Proof of Obsolescence:**

```bash
grep -r "SimpleWorkspace" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/SimpleWorkspace.tsx`

### Task 2.3: Remove WidgetWorkspace.tsx

**Proof of Obsolescence:**

```bash
grep -r "WidgetWorkspace" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/WidgetWorkspace.tsx`

### Task 2.4: Remove DiscussionStarter.tsx

**Proof of Obsolescence:**

```bash
grep -r "DiscussionStarter" apps/frontend/src --include="*.tsx" --include="*.ts"
```

**Files:**

- Delete: `apps/frontend/src/components/DiscussionStarter.tsx`

---

## Sprint 3: Duplicate Portal Cleanup (MEDIUM RISK)

**Goal:** Remove duplicate portal implementations.
**Logic:** Many portals have `Unified*` or `*Portal` versions. With DesktopUnified deleted, the active portals are those wrapped as MaterializableBlocks and registered in `portal_registry.tsx` for lazy-loading into TelescopeSurface.

### Task 3.1: Remove ConsolidatedUserChatPortal.tsx

**Proof:**

```bash
grep -r "ConsolidatedUserChatPortal" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/ConsolidatedUserChatPortal.tsx`

### Task 3.2: Remove MindMap.tsx

**Proof:**

```bash
grep -r "MindMap" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/MindMap.tsx`

### Task 3.3: Remove CapabilityRegistry.tsx

**Proof:**

```bash
grep -r "CapabilityRegistry" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/CapabilityRegistry.tsx`

### Task 3.4: Remove EventStreamMonitor.tsx

**Proof:**

```bash
grep -r "EventStreamMonitor" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/EventStreamMonitor.tsx`

### Task 3.5: Remove InsightsPanel.tsx

**Proof:**

```bash
grep -r "InsightsPanel" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/InsightsPanel.tsx`

### Task 3.6: Remove OperationsMonitor.tsx

**Proof:**

```bash
grep -r "OperationsMonitor" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/OperationsMonitor.tsx`

### Task 3.7: Remove SecurityGateway.tsx

**Proof:**

```bash
grep -r "SecurityGateway" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/SecurityGateway.tsx`

---

## Sprint 4: Unused Feature Components (MEDIUM RISK)

**Goal:** Remove feature components that were built but never integrated.

### Task 4.1: Remove Knowledge Components

**Proof:**

```bash
grep -r "KnowledgeDashboard" apps/frontend/src
grep -r "KnowledgeSearch" apps/frontend/src
grep -r "KnowledgeItemCard" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/KnowledgeDashboard.tsx`
- Delete: `apps/frontend/src/components/KnowledgeSearch.tsx`
- Delete: `apps/frontend/src/components/KnowledgeItemCard.tsx`

### Task 4.2: Remove BatchProgressTracker.tsx

**Proof:**

```bash
grep -r "BatchProgressTracker" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/BatchProgressTracker.tsx`

### Task 4.3: Remove MCPServerManager.tsx

**Proof:**

```bash
grep -r "MCPServerManager" apps/frontend/src
```

_Note: Replaced by MCPConfigUpload_

**Files:**

- Delete: `apps/frontend/src/components/MCPServerManager.tsx`

### Task 4.4: Remove ArtifactGenerationPanel.tsx

**Proof:**

```bash
grep -r "ArtifactGenerationPanel" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/ArtifactGeneration/ArtifactGenerationPanel.tsx`
- Delete: `apps/frontend/src/components/ArtifactGeneration/` (if empty)

### Task 4.5: Remove ToolsPanel & UnifiedToolPortal

**Proof:**

```bash
grep -r "ToolsPanel" apps/frontend/src
grep -r "UnifiedToolPortal" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/ToolsPanel.tsx`
- Delete: `apps/frontend/src/components/futuristic/portals/UnifiedToolPortal.tsx`

### Task 4.6: Remove KnowledgeGraphVisualization.tsx

**Proof:**

```bash
grep -r "KnowledgeGraphVisualization" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/futuristic/portals/KnowledgeGraphVisualization.tsx`

### Task 4.7: Remove Agent.tsx (Basic Card)

**Proof:**

```bash
grep -r "from.*['"].*components/Agent['"]" apps/frontend/src
```

_Note: Ensure `AgentManager` and `AgentAvatar` are NOT targeted._

**Files:**

- Delete: `apps/frontend/src/components/Agent.tsx`

### Task 4.8: Remove EnhancedChatManager.tsx

**Proof:**

```bash
grep -r "EnhancedChatManager" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/EnhancedChatManager.tsx`

---

## Sprint 5: Fix Broken Import - DebateArena (HIGH RISK)

**Issue:** `src/pages/Index.tsx` imports `DebateArena` which does not exist.
**Solution:** Replace with `BattleArena` which exists in `src/components/marketplace/`.

### Task 5.1: Fix Index.tsx

**Verification:**

- `ls src/components/marketplace/BattleArena.tsx` (Exists)
- `cat src/pages/Index.tsx` (Shows broken import)

**Action:**

1. Edit `apps/frontend/src/pages/Index.tsx`:
   - Change `import DebateArena from '@/components/DebateArena';` to `import BattleArena from '@/components/marketplace/BattleArena';`
   - Update `<DebateArena ... />` usage to `<BattleArena ... />` (verify props match).
   - If props don't match, verify `BattleArena` interface first.

---

## Sprint 6: Superseded Component Removal (MEDIUM RISK)

**Goal:** Remove major components that have been fully replaced.

### Task 6.1: ~~Remove Desktop.tsx~~ — COMPLETED

> **Status**: COMPLETED (2026-03-21). Both `Desktop.tsx` and `DesktopUnified.tsx` have been deleted. `TelescopeSurface` is now the primary interface. `DesktopApp.tsx` routes to TelescopeSurface. No action needed.

### Task 6.2: Remove chat/EnhancedChatInterface.tsx

**Proof:**

```bash
grep -r "EnhancedChatInterface" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/chat/EnhancedChatInterface.tsx`

### Task 6.3: Remove KnowledgeShortcut.tsx

**Proof:**

```bash
grep -r "KnowledgeShortcut" apps/frontend/src
```

**Files:**

- Delete: `apps/frontend/src/components/KnowledgeShortcut.tsx`

---

## Rollback Strategy

If a build fails or a runtime error occurs:

1. **Immediate Revert:** `git checkout HEAD~1` (revert last commit).
2. **Analysis:** Run `grep` again to find the hidden dependency (e.g., dynamic import, string literal).
3. **Restore:** If functionality is needed, restore the file.

## Post-Cleanup Verification

1. **Full Build:** `cd apps/frontend && pnpm build` (MUST PASS).
2. **Lint:** `pnpm lint` (No new errors).
3. **Dev Server:** `pnpm dev` (Manual check of TelescopeSurface and Chat).
4. **Portal Registry:** Verify `portal_registry.tsx` has no broken imports after deletions.
