# Refactoring Fixes - Problems Log

## 2026-01-27

- Backend typecheck (`tsc -p backend/tsconfig.json --noEmit`) fails due to pre-existing errors across multiple services and test files.
- `eventBus.ts` still reports pre-existing deprecation hints for `substr` usage at lines 356, 690, and 867.
- `pnpm build` fails in `pnpm build:backend` with pre-existing TypeScript errors across shared/services and multiple services (see build log for details).
