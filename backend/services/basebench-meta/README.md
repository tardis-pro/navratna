# BaseBench-Meta Service

BaseBench-Meta turns the benchmark spec in `navratna/docs/specs/08-BASEBENCH-META.md` into an executable backend service.

## What it provides

- Typed BaseBench schemas via `@uaip/types`
- Seeded benchmark cases for the five v1 task families
- Deterministic scoring for action choice, calibration, clarification quality, self-correction, and belief updating
- REST endpoints for listing cases and evaluating single or batch runs

## API

- `GET /api/v1/basebench/cases`
- `GET /api/v1/basebench/cases/:caseId`
- `GET /api/v1/basebench/families`
- `POST /api/v1/basebench/evaluate`
- `POST /api/v1/basebench/evaluate/batch`

## Development

```bash
pnpm --filter @uaip/basebench-meta dev
pnpm --filter @uaip/basebench-meta test
pnpm --filter @uaip/basebench-meta build
```
