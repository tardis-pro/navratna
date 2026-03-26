# MaterializableBlock/ — HOC + Visual State System

4 files (the **only** component in this codebase that fully follows the documented 4-file pattern). Wraps every block in `TelescopeSurface` with visibility transitions, drag/resize, relevance badge, and 7-state microexpression animation.

## FILES

| File | Role |
|------|------|
| `MaterializableBlock.tsx` | Component + `withMaterializableBlock()` HOC + `useMaterializableBlocks()` context hook + `autoArrangeBlocks()` utility |
| `materializable_block_types.ts` | All types: `MaterializableBlockData`, `BlockVisibility`, `BlockPosition`, `BlockDimensions`, `AutoArrangeConfig`, `MaterializableBlockContextValue`, `WithMaterializableBlockConfig` |
| `materializable_block_styles.ts` | OKLCH color maps, `VISIBILITY_STYLES`, `BLOCK_TYPE_COLORS`, `MICROEXPRESSION_COLORS`, keyframe strings, `getBlockBaseStyle()` |
| `index.ts` | Barrel export |

## CORE TYPES

```typescript
interface MaterializableBlockData {
  id: string;
  type: 'agent' | 'portal' | 'artifact' | 'discussion' | 'task';
  expression: Microexpression;          // drives animation variant
  relevanceScore: number;               // 0–1, drives visibility tier
  visibility: 'visible' | 'faded' | 'hidden';
  position: { x: number; y: number; z: number };
  dimensions: { width: number; height: number };
  metadata?: Record<string, unknown>;   // { title: string } for portals
}
```

## THE 7 MICROEXPRESSION STATES

| State | Icon | Animation | When to Use |
|-------|------|-----------|-------------|
| `calm` | `Minus` | Static | Default idle state |
| `attentive` | `Eye` | scale 1.005, brightness 1.03 | Awaiting input, listening |
| `working` | `Activity` | Opacity pulses 1→0.72 (2s loop) | Processing / loading |
| `alarmed` | `AlertTriangle` | Scale pulses 1→1.018 (0.5s), brightness 1.08 | Error, urgent attention needed |
| `confused` | `HelpCircle` | Opacity flickers 1→0.55 (1s loop) | Unclear state, partial data |
| `satisfied` | `CheckCircle` | Static, brightness 1.06 | Success, completed |
| `strained` | `Zap` | Static, scale 0.997, brightness 0.85 | Resource-constrained, overloaded |

Expression drives both the Framer Motion `animate` variant on the block frame AND the OKLCH border color/glow via `MICROEXPRESSION_COLORS` from `@uaip/types`.

## AUTO-ARRANGE

`autoArrangeBlocks(blocks, config)` computes grid positions for all blocks:

```typescript
interface AutoArrangeConfig {
  gridCols: number;   // default 3
  blockWidth: number; // default 400
  blockHeight: number;// default 500
  gap: number;        // default 24
  padding: number;    // default 24
}
```

Called by `createInitialBlocks()` in `TelescopeSurface/portal_registry.tsx`.

## HOW TO USE

```tsx
// Wrap a component as a materializable block
const MyBlock = withMaterializableBlock(MyComponent, { defaultExpression: 'calm' });

// Access block state from within a block
const { blocks, updateRelevance, updateExpression } = useMaterializableBlocks();
updateExpression('my-block-id', 'working');
updateRelevance('my-block-id', 0.9);
```

## STYLE CONVENTIONS

- All colors in `materializable_block_styles.ts` use **OKLCH** — never hex/hsl
- Add new block types → extend `BLOCK_TYPE_COLORS` + `MaterializableBlockType` union in `.types.ts`
- Glass morphism: `backdrop-blur-md bg-white/10 border-white/20` (from `VISIBILITY_STYLES`)
