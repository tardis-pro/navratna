# TASK-01.8: Command History Integration

**Status:** 🔴 Not Started
**Priority:** P2: Medium
**Parent Epic:** [EPIC-01: UI-Backend Integration](EPIC-01-UI-Backend-Integration.md)
**Depends On:** [TASK-01.3: Frontend API Service Module](TASK-01.3-Frontend-API-Service.md)
**Related Feature:** [13-COMMAND-HISTORY.md](../00-FEATURE-LIST.md)
**Assignee:** TBD
**Estimate:** 2-3 hours

## Goal

Integrate the Command History display into the frontend UI. This involves adding a backend API endpoint to retrieve recent command history entries from the `CommandHistoryAnalyzer`, creating a corresponding frontend API service function, and connecting the UI component to display the history.

## Sub-Tasks

1.  **Backend: Define `GET /api/history/commands` Endpoint:**
    *   In `server/index.ts`, define a new route handler for `GET /api/history/commands`.
    *   Expect optional query parameters like `limit` (e.g., `/api/history/commands?limit=20`).
    *   Inside the handler, access the initialized `commandHistoryAnalyzer` instance from the `AgentOrchestrator` (or directly).
    *   Call `commandHistoryAnalyzer.getHistoryEntries(limit)` using the provided limit or a default value.
    *   Handle potential errors during history retrieval.
    *   Return the array of `CommandHistoryEntry` objects as JSON.

2.  **Frontend: Add `getCommandHistory` API Function:**
    *   In `app/services/api.ts`, define an async function `getCommandHistory(limit?: number): Promise<CommandHistoryEntry[]>` (import `CommandHistoryEntry` type).
    *   Make a `GET` request to `/history/commands` using the Axios instance, passing the `limit` as a query parameter if provided.
    *   Return the array of `CommandHistoryEntry` objects from the response data.
    *   Handle potential API errors.

3.  **Identify Command History UI Component:**
    *   Locate the React component responsible for displaying the command history (e.g., `app/components/sections/CommandHistory.tsx`).

4.  **Fetch Command History Data:**
    *   Use the `useEffect` hook in the UI component to call `getCommandHistory()` (with a reasonable default limit, e.g., 20) when the component mounts.
    *   Manage loading and error states for the data fetching process.
    *   Store the fetched command history entries in the component's state.

5.  **Display Command History:**
    *   Modify the component's render logic to display the list of `CommandHistoryEntry` results.
    *   For each entry, display relevant information (e.g., command, directory, timestamp, exit code).
    *   Consider displaying entries in reverse chronological order (most recent first).
    *   Handle the case where the history is empty.

6.  **Refactor Existing Logic:**
    *   Remove any previous mock command history data or logic within the component.

7.  **Verification:**
    *   Run the frontend and backend servers concurrently.
    *   Ensure the backend's `CommandHistoryAnalyzer` has some history data (manual recording via its methods or ensuring it picks up actual shell history might be needed for testing).
    *   Verify the UI component loads and displays the command history fetched from the backend.
    *   Verify loading indicators and basic error handling work.

## Definition of Done

- Backend endpoint `GET /api/history/commands` is implemented and returns data from the `CommandHistoryAnalyzer`.
- Frontend API service function `getCommandHistory` is implemented and communicates with the backend endpoint.
- Command History UI component fetches data using the API function on mount.
- Fetched command history entries are displayed correctly in the UI.
- Loading and error states are handled visually.
- Previous mock command history logic is removed.

## Notes

- For MVP testing, manually calling `commandHistoryAnalyzer.recordCommand` on the backend might be necessary to populate history if automatic shell history parsing isn't fully set up or functional yet.
- The UI display can be a simple list initially. Features like filtering or searching history are future enhancements.
