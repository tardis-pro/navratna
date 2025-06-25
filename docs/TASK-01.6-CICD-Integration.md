# TASK-01.6: CI/CD Monitor Integration

**Status:** 🔴 Not Started
**Priority:** P2: Medium
**Parent Epic:** [EPIC-01: UI-Backend Integration](EPIC-01-UI-Backend-Integration.md)
**Depends On:** [TASK-01.3: Frontend API Service Module](TASK-01.3-Frontend-API-Service.md)
**Related Feature:** [16-CICD-MONITOR.md](../00-FEATURE-LIST.md)
**Assignee:** TBD
**Estimate:** 2-4 hours

## Goal

Integrate the CI/CD monitoring section of the UI (`CICDMonitor.tsx` or similar) to display real-time or periodically refreshed status data fetched from the backend's `CICDTracker` module.

## Sub-Tasks

1.  **Backend: Define `GET /api/cicd/status` Endpoint:**
    *   In `server/index.ts`, define a new route handler for `GET /api/cicd/status`.
    *   Inside the handler, access the initialized `cicdTracker` instance from the `AgentOrchestrator` (or directly if managed separately).
    *   Call methods like `cicdTracker.getPipelines()`, `cicdTracker.getEnvironments()`, `cicdTracker.getQualityMetrics()`.
    *   Structure the response data, potentially combining pipelines, environments, and quality metrics into a single JSON object (e.g., `{ pipelines: [...], environments: [...], qualityMetrics: [...] }`).
    *   Handle potential errors during data retrieval.
    *   Return the status data as JSON.

2.  **Frontend: Add `getCICDStatus` API Function:**
    *   In `app/services/api.ts`, define an async function `getCICDStatus(): Promise<{ pipelines: CIPipeline[], environments: DeploymentEnvironment[], qualityMetrics: QualityMetrics[] }>` (import relevant types).
    *   Make a `GET` request to `/cicd/status` using the Axios instance.
    *   Return the structured status data from the response.
    *   Handle potential API errors.

3.  **Identify CI/CD UI Component:**
    *   Locate the React component responsible for displaying CI/CD status (likely `app/components/sections/CICDMonitor.tsx`).

4.  **Fetch CI/CD Data:**
    *   Use the `useEffect` hook in the UI component to call `getCICDStatus()` when the component mounts.
    *   Consider implementing periodic refetching using `setInterval` within the `useEffect` hook (or a more robust data fetching library like React Query/SWR) to keep the data updated. Clear the interval on component unmount.
    *   Manage loading and error states for the data fetching process.
    *   Store the fetched pipelines, environments, and quality metrics in the component's state.

5.  **Display CI/CD Data:**
    *   Modify the component's render logic to display the fetched data:
        *   List CI pipelines with their status, name, provider, last run time, etc.
        *   List deployment environments with their status, name, version, etc.
        *   Display key quality metrics (e.g., quality gate status, coverage, bugs).
    *   Use appropriate visual indicators (e.g., color-coded status icons) based on the data.
    *   Handle cases where data arrays are empty.

6.  **Refactor Existing Logic:**
    *   Remove any previous mock CI/CD data or logic within the component.

7.  **Verification:**
    *   Run the frontend and backend servers concurrently.
    *   Ensure the backend's `CICDTracker` is configured with at least one provider (e.g., GitHub Actions, Jenkins) and potentially SonarQube/SonarCloud for testing. This might require adding dummy or real configuration via the tracker's methods or configuration files.
    *   Verify the UI component loads and displays the CI/CD status fetched from the backend.
    *   If periodic refresh is implemented, verify the data updates automatically.
    *   Verify loading indicators and basic error handling work.

## Definition of Done

- Backend endpoint `GET /api/cicd/status` is implemented and returns data from the `CICDTracker`.
- Frontend API service function `getCICDStatus` is implemented and communicates with the backend endpoint.
- CI/CD UI component fetches data using the API function on mount (and potentially periodically).
- Fetched pipeline, environment, and quality metric data are displayed correctly in the UI.
- Loading and error states are handled visually.
- Previous mock CI/CD data logic is removed.

## Notes

- For initial testing, the backend `CICDTracker` might need manual configuration (e.g., adding a provider with credentials/settings) to return actual data. Refer to `store/cicd.ts` for configuration methods (`addProvider`, `configureSonarIntegration`).
- The UI display can be basic initially, focusing on showing the core status information.
- Real-time updates via WebSockets/SSE are a potential future enhancement beyond simple polling.
