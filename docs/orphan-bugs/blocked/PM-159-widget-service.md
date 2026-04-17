# PM-159 BLOCKED: widget_service.ts — 14 database methods stubbed

## Status: BLOCKED — Do Not Implement

## Reason

Per `apps/shared/services/AGENTS.md`:

> "Do not fill these stubs without coordinating with the domain service migration plan."

`widgetService.ts` is explicitly listed as a known TODO placeholder pending a domain service migration plan. The 14 stub methods (`storeWidget`, `getWidget`, `executeWidgetQuery`, etc.) return null/empty and are intentionally deferred.

## What Would Be Needed

1. Drizzle schema additions for widget tables (intelligence plane)
2. Domain service migration plan decision
3. Coordination with other parallel agent work

## Next Steps

File a follow-up ticket under a "Widget Service Domain Migration" epic with proper schema design.
