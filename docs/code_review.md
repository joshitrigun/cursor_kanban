# Code Review Report

Date: 2026-07-08

Scope: top-level application in `backend/`, `frontend/`, deployment files, scripts, and existing automated tests. The duplicate `cursor_kanban/` tree appears to be a stale copy of the same project, so the findings below focus on the active top-level app.

## Remediation Status

- Shared trip updates are fixed: all family members now write the same shared trip record.
- Shared board writes now require `expectedBoardVersion` and reject stale saves with `409 Conflict`.
- Quick-add URL enrichment now blocks non-public targets and re-validates redirects instead of following them blindly.
- The Dockerfile now builds the frontend static export and copies `frontend/out` into the final image.
- Docker smoke validation is now complete: the rebuilt container served `/api/health`, loaded the current `Pacific Northwest Trip Plan` UI on a clean origin, and passed a browser logout/login round trip.
- Frontend unit tests are green again.
- `cursor_kanban/` is now documented as an archived duplicate snapshot in the repository README and its own README.

## Validation Summary

- Backend tests: `backend\.venv\Scripts\pytest.exe` passed with 58 tests.
- Frontend unit tests: `npm run test:unit` failed with 3 failing `AppShell` tests.
- Reproduced with `TestClient`: non-owner trip updates are not visible on subsequent reads.
- Reproduced with `TestClient`: two stale shared-board saves silently overwrite each other.
- Docker/container smoke test was not run because this environment does not provide Docker access.

## Findings

### 1. High: Trip writes and trip reads target different owners

Evidence:

- `get_trip_for_user` always reads the trip row for `FAMILY_BOARD_OWNER` in [backend/app/db.py](../backend/app/db.py).
- `upsert_trip_for_user` writes to the authenticated user's own `trips.user_id` row in [backend/app/db.py](../backend/app/db.py).

Why this matters:

- The app presents one shared family trip, but only `dad` can actually update the trip that everyone reads.
- Any other user gets a `200` from `PUT /api/trip`, but the next `GET /api/trip` still returns the original shared trip. That is a silent data-loss bug from the user's perspective.

Confirmed reproduction:

- Logged in as `mom`.
- `PUT /api/trip` returned `200` with the updated Banff trip.
- Immediate `GET /api/trip` still returned `Vancouver & Whistler Family Trip`.

Recommended action:

- Decide whether trip metadata is shared or per-user.
- If shared, make `upsert_trip_for_user` resolve the same owner row as `get_trip_for_user`.
- Add a backend regression test for a non-owner updating the shared trip.

### 2. High: Shared board updates are last-write-wins and lose concurrent edits

Evidence:

- `update_board_for_username` blindly replaces the full `board_json` and increments `board_version` in [backend/app/db.py](../backend/app/db.py).
- The frontend persists only `{ board }` with no expected version in [frontend/src/components/AppShell.tsx](../frontend/src/components/AppShell.tsx).

Why this matters:

- The product is explicitly a shared family board. Two sessions can load the same snapshot, make different edits, and the later save will erase the earlier save with no conflict or merge warning.
- `boardVersion` is returned by the API, but it is not used to protect writes.

Confirmed reproduction:

- Session 1 changed column 1 title to `Dad Edit` and saved.
- Session 2 saved a stale snapshot with only column 2 changed to `Mom Edit`.
- Final board lost `Dad Edit` entirely and reverted column 1 to the stale value.

Recommended action:

- Require the client to send the version it edited.
- Reject stale writes with `409 Conflict` when `expectedBoardVersion` does not match the current stored version.
- Add an integration test that exercises two concurrent sessions against the shared board.

### 3. High: Quick-add URL enrichment can be used for server-side request forgery

Evidence:

- `_is_safe_url` in [backend/app/api.py](../backend/app/api.py) only checks for `http` or `https` plus a non-empty netloc.
- `_fetch_og_metadata` in [backend/app/api.py](../backend/app/api.py) performs a server-side fetch with redirects enabled.
- The quick-add endpoint then calls that fetch for any authenticated user via `POST /api/cards/quick-add` in [backend/app/api.py](../backend/app/api.py).

Why this matters:

- Any authenticated user can make the backend request arbitrary URLs, including internal RFC1918 hosts, cloud metadata endpoints, or services reachable only from the server/container network.
- Redirect following makes hostname allowlisting harder to enforce later unless it is handled deliberately.

Recommended action:

- Block private, loopback, link-local, and metadata-service IP ranges after DNS resolution.
- Consider an explicit hostname allowlist if enrichment only needs public travel sites.
- Disable redirects or re-validate each redirect target before following it.
- Add tests for localhost, private IP, and redirect-to-private targets.

### 4. Medium: Docker image does not build or ship the frontend it is expected to serve

Evidence:

- The backend only mounts the app UI if `frontend/out` exists in [backend/app/main.py](../backend/app/main.py).
- The Dockerfile only copies `backend/` into the image in [Dockerfile](../Dockerfile).
- The start scripts only run `docker build` and `docker run` against that same image in [scripts/start-windows.ps1](../scripts/start-windows.ps1), [scripts/start-macos.sh](../scripts/start-macos.sh), and [scripts/start-linux.sh](../scripts/start-linux.sh).
- The README says the container exposes the app at `http://127.0.0.1:8000` and that FastAPI can serve the exported frontend when `frontend/out` exists in [README.md](../README.md).

Why this matters:

- The built container cannot contain `frontend/out`, so the runtime falls back to the placeholder HTML instead of the real trip planner UI.
- That directly conflicts with the documented local Docker flow.

Recommended action:

- Convert the Dockerfile to a multi-stage build that installs frontend deps, runs `next build`, and copies `frontend/out` into the final image.
- Add one automated smoke check that asserts `/` contains the real app shell rather than the placeholder page.
- Update the README once the container path is actually verified.

### 5. Medium: Frontend unit suite is red because `AppShell` tests no longer match the current UI structure

Evidence:

- `npm run test:unit` currently fails 3 tests in [frontend/src/components/AppShell.test.tsx](../frontend/src/components/AppShell.test.tsx).
- The failing assertions still look for `data-testid` values matching `/column-/i` and for inputs labeled `column title`, but the current board experience renders the day-tab layout instead.

Current failing points:

- [frontend/src/components/AppShell.test.tsx](../frontend/src/components/AppShell.test.tsx) line 138.
- [frontend/src/components/AppShell.test.tsx](../frontend/src/components/AppShell.test.tsx) line 261.
- [frontend/src/components/AppShell.test.tsx](../frontend/src/components/AppShell.test.tsx) line 348.

Why this matters:

- CI signal is already degraded on the frontend path.
- More importantly, the tests that were supposed to protect save debouncing and board-load behavior are no longer verifying the active UI affordances.

Recommended action:

- Update `AppShell` tests to interact through the current day-tab and quick-add flows.
- Keep the save-queue coverage, but assert against stable user-visible behavior instead of removed selectors.
- Make `npm run test:unit` a required green gate before merging further frontend changes.

## Additional Notes

- Backend test coverage is decent for happy-path API behavior, but it currently misses the shared-trip ownership bug and the shared-board concurrency problem.
- Backend tests emit a deprecation warning from `fastapi.testclient` about the `httpx` integration. That is not urgent, but it should be cleaned up before the next dependency upgrade tightens compatibility.
- The duplicate `cursor_kanban/` tree increases maintenance noise and can easily hide drift. If it is not an intentional archive, remove it or document its purpose clearly.

## Priority Actions

1. Fix trip ownership so every family member updates the same shared trip record.
2. Add optimistic concurrency to board writes and reject stale saves.
3. Lock down quick-add URL fetching against SSRF.
4. Repair the Docker build so the shipped container actually serves the frontend.
5. Bring the frontend unit suite back to green and add coverage for the shared-trip and stale-write regressions.