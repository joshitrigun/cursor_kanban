# Project Plan

This document turns the project outline into an execution plan that can be approved before implementation. Each phase stays small, proves its behavior with tests, and establishes a clear stopping point before moving on.

## Current Baseline

- The product is now a family vacation planner for a Vancouver and Whistler trip, not a generic project management board.
- The frontend in [frontend](d:\learn\pm\pm\frontend) is a Next.js app with a travel-focused board, Day 1-Day 6 itinerary tabs, an Ideas Inbox, quick-add, and AI chat.
- The authenticated family experience supports named seeded users sharing one family trip board.
- The trip is seeded from `2026-06-28` through `2026-07-03`.
- The board supports column rename, add card, delete card, drag-and-drop card movement, day finalization, Trip Readiness checks, and timeline-style day planning.
- Day views are organized into Morning, Afternoon, Evening, and Anytime sections with missing meal, missing travel, packed-day, and finalized-day signals.
- The Vancouver/Whistler visual identity is the primary theme; World Cup is an optional event category, not the whole product theme.
- Frontend tests already exist with Vitest and Playwright.
- A FastAPI backend exists in [backend](d:\learn\pm\pm\backend) with API routes, SQLite persistence, session auth, AI routes, and a JSON health route at `/api/health`.
- The exported frontend is now served by FastAPI at `/` when [frontend/out](d:\learn\pm\pm\frontend\out) is present.
- A backend-managed MVP login flow gates access with seeded family accounts using hashed passwords.
- Board state is persisted in SQLite and loaded from `/api/board`.
- Trip metadata is persisted in SQLite and loaded from `/api/trip`.
- Cards support travel fields such as `status`, `start_time`, `end_time`, `location`, `address`, `content_url`, `ai_title`, `ai_summary`, `ai_tag`, `suggested_by`, `trip_date`, and `deadline`.
- AI requests run through backend-only OpenRouter routes and validated board mutations are applied on the backend.
- The authenticated UI includes a responsive chat sidebar that restores persisted chat history from `/api/chat-history`.

## Travel Product Roadmap

The next product work should optimize for itinerary confidence and family coordination rather than generic task management.

- Make the day itinerary the primary experience: Morning/Afternoon/Evening/Anytime sections, meal and travel gaps, pace warnings, and mobile-first day switching.
- Treat the Ideas Inbox as the family intake area: category grouping, suggested-by visibility, and quick actions to assign, shortlist, or reject ideas.
- Use travel-native statuses: Idea, Researching, Shortlisted, Booked, Confirmed, and Skipped.
- Add Trip Readiness: hotels, transport, booked activities, meals, packing, documents, and emergency info.
- Add decision support to cards: owner, deadline, cost estimate, booking required, and reservation link.
- Make AI planner actions reviewable: optimize a day, find lunch nearby, rebalance crowded days, create rainy-day alternatives, and apply proposed changes only after user approval.

Near-term product gaps:

- Finish Ideas Inbox category grouping and actions.
- Expand Trip Readiness beyond the first four derived essentials.
- Seed realistic content for Days 3-6.
- Improve compact mobile itinerary behavior.

Out of scope for the MVP:

- Payment splitting.
- Full booking integrations.
- Real-time collaborative cursors.
- Native mobile app.
- Full routing engine.

## Current Status

- Parts 1 through 10 are implemented.
- Backend validation is in place for auth, board persistence, OpenRouter connectivity, structured AI responses, and chat history retrieval.
- Frontend validation is in place for login, board interactions, chat sidebar behavior, AI request sequencing, logout reset, and chat history restoration.
- Docker and container smoke checks remain environment-dependent because Docker Desktop access on this machine is restricted by organization sign-in.

## Ground Rules

- Keep one shared family trip board for the MVP while preserving user records for attribution and future permissions.
- Keep the board JSON contract simple, but present the product as a trip itinerary and family planning workspace.
- Prefer simple, explicit contracts over abstractions.
- Backend remains the source of truth once persistence is introduced.
- AI never mutates board state directly from the frontend; the backend validates and applies structured changes.
- Complete each phase with tests before moving to the next phase.

## Part 1: Planning And Documentation

Goal: approve the execution plan and document the existing frontend so future work starts from the actual baseline.

Checklist:

- [x] Rewrite this plan into detailed phases with checklists, tests, and success criteria.
- [x] Create a frontend-specific AGENTS file that describes the existing app structure and behavior.
- [x] Confirm user approval for the plan before implementation starts.
- [x] Confirm the initial product and architecture decisions needed to begin implementation.

Tests:

- Manual review of [docs/PLAN.md](d:\learn\pm\pm\docs\PLAN.md) for completeness.
- Manual review of [frontend/AGENTS.md](d:\learn\pm\pm\frontend\AGENTS.md) for accuracy.

Success criteria:

- A new contributor can understand the current app and the implementation sequence from docs alone.
- The next implementation task can begin without guessing target behavior.

## Part 2: Scaffolding

Goal: create the deployable project shell with Docker, FastAPI, and cross-platform start and stop scripts, while proving backend and container wiring with a minimal example.

Checklist:

- [x] Create the backend project structure in [backend](d:\learn\pm\pm\backend).
- [x] Add FastAPI app entrypoint and a minimal API route.
- [x] Add a minimal HTML response or static placeholder served by FastAPI for initial smoke testing.
- [x] Add Python dependency management using `uv`.
- [x] Add Dockerfile and any supporting container config.
- [x] Add start scripts for Windows, macOS, and Linux in [scripts](d:\learn\pm\pm\scripts).
- [x] Add stop scripts for Windows, macOS, and Linux in [scripts](d:\learn\pm\pm\scripts).
- [ ] Document local setup and container run flow in a minimal README update if required.
- [ ] Run the Docker smoke test on a machine with the Docker daemon available.

Tests:

- Backend unit test for the hello-world API route.
- Script smoke test that starts the backend locally.
- Docker smoke test that builds and runs the container successfully.
- Manual browser check that `/` loads placeholder content and an API route responds.

Success criteria:

- One command path exists per OS to start and stop the app.
- Docker can build the project without manual intervention.
- FastAPI serves both a page at `/` and a working example API route.

## Part 3: Serve The Existing Frontend

Goal: replace the placeholder page with the existing Kanban frontend and serve it through the backend packaging flow.

Checklist:

- [x] Decide and document the frontend production serving model.
- [x] Build the frontend for production.
- [x] Serve the built frontend from FastAPI at `/`.
- [x] Preserve the current Kanban interactions in the served app.
- [x] Update scripts and Docker flow to build both backend and frontend together.
- [x] Ensure asset paths and static file serving work correctly in local FastAPI serving.
- [ ] Validate asset paths and static file serving inside the Docker container.

Tests:

- Existing frontend unit tests still pass.
- Docker smoke test confirms the Kanban page renders at `/`.
- Backend smoke tests confirm FastAPI serves the exported frontend and static assets.
- Local HTTP smoke test confirms `/` and `/api/health` respond correctly through `uvicorn`.
- Browser automation confirms the integrated app loads and supports add-card and drag-and-drop interactions over the FastAPI-served build.

Success criteria:

- The browser shows the current Kanban board at `/` when launched through the backend/container flow.
- No existing Kanban behavior regresses during packaging.

## Part 4: MVP Login Flow

Goal: require users to sign in with hardcoded credentials before seeing the board, and support logging out.

Checklist:

- [x] Choose the auth state mechanism for MVP, preferably backend-managed session state.
- [x] Add a login UI for `user` / `password`.
- [x] Add a backend login endpoint if using server-managed auth.
- [x] Gate access to the board until authenticated.
- [x] Add logout behavior.
- [x] Add clear error messaging for invalid credentials.

Tests:

- Frontend unit tests for login form behavior and error states.
- Backend tests for login and logout routes if session state is server-side.
- End-to-end test covering login success, login failure, protected access, and logout.
- Local browser automation confirms protected first load, successful login, and logout back to the login form.

Success criteria:

- Unauthenticated users cannot access the board view.
- `user` / `password` grants access consistently.
- Logout returns the user to the login screen and removes authenticated access.

## Part 5: Database Modeling

Goal: define and document a simple SQLite persistence model for users, boards, and saved Kanban JSON.

Checklist:

- [x] Propose the SQLite schema.
- [x] Keep one board per user for MVP while preserving a future path to multiple users.
- [x] Decide how board JSON is stored and versioned.
- [x] Decide how chat history is stored for future AI context.
- [x] Document the schema and persistence approach in [docs](d:\learn\pm\pm\docs).
- [x] Get user approval before implementing persistence.

Tests:

- Manual schema review.
- Migration or initialization smoke test that creates the database from scratch.

Proposed design:

- See [docs/DATABASE.md](d:\learn\pm\pm\docs\DATABASE.md).

Success criteria:

- The schema is simple, documented, and sufficient for the MVP.
- A fresh environment can create the database automatically.

## Part 6: Backend Kanban API

Goal: add backend persistence and CRUD-style board operations for the authenticated user.

Checklist:

- [x] Add database initialization on startup if the SQLite file does not exist.
- [x] Add repository or service functions for reading and updating a user board.
- [x] Seed a default board for a new user if one does not exist.
- [x] Add API routes to fetch the board.
- [x] Add API routes to replace or update board state.
- [x] Validate payload shapes server-side.
- [x] Keep the API contract narrow and explicit.

Tests:

- Backend unit tests for data access and service functions.
- Backend API tests for board fetch and board update behavior.
- Tests for first-run database creation and default board seeding.
- Backend tests confirm board updates persist across app restarts using the same SQLite file.

Success criteria:

- The backend can create, read, and update the authenticated user's board.
- Invalid payloads are rejected cleanly.
- Data persists across restarts.

## Part 7: Frontend And Backend Integration

Goal: make the UI load and persist board state through the backend instead of local in-memory state.

Checklist:

- [x] Replace frontend initialization from static demo data with API-driven load.
- [x] Persist column rename, add card, delete card, and card move operations through the API.
- [x] Add loading and error states where needed.
- [x] Keep optimistic updates simple; prefer correctness over aggressive client caching.
- [x] Ensure logout and login produce the expected board fetch behavior.

Tests:

- Frontend unit tests for API-backed board behavior where practical.
- Integration or end-to-end tests covering reload persistence.
- Regression tests for all existing board interactions.
- Browser automation confirms a card added through the backend-served UI survives page reload.

Success criteria:

- Board changes survive refresh and restart.
- The frontend no longer depends on hardcoded in-memory board state during normal app flow.

## Part 8: OpenRouter Connectivity

Goal: prove backend-only connectivity to OpenRouter before mixing AI into product behavior.

Checklist:

- [x] Add configuration loading for `OPENROUTER_API_KEY`.
- [x] Add a backend client wrapper for OpenRouter using `openai/gpt-oss-120b`.
- [x] Add a simple backend test route or internal diagnostic path for a trivial prompt.
- [x] Keep secrets server-side only.
- [x] Document required environment variables.

Tests:

- Automated unit tests for request construction with mocked HTTP responses.
- Manual connectivity test asking `2+2` in a controlled backend-only path.

Implementation notes:

- The backend loads `OPENROUTER_API_KEY` from the repo root `.env` file.
- The backend exposes `POST /api/ai/connectivity-test` for authenticated backend-only verification.
- Live validation against `openai/gpt-oss-120b` returned `4` for the controlled `2+2` prompt.

Success criteria:

- The backend can successfully call OpenRouter with the configured model.
- No API key handling leaks into the frontend.

## Part 9: Structured AI Board Updates

Goal: have the backend send board context and chat history to the model and safely process structured responses.

Checklist:

- [x] Define the structured response schema for AI replies.
- [x] Include current board JSON in the backend prompt.
- [x] Include relevant conversation history in the backend prompt.
- [x] Support responses containing both user-facing text and optional board updates.
- [x] Validate the AI response against the schema.
- [x] Apply validated board updates on the backend only.
- [x] Persist chat history if required by the approved design.
- [x] Reject malformed AI responses safely.

Tests:

- Unit tests for schema validation.
- Unit tests for applying valid board updates.
- Unit tests for malformed, partial, or no-op AI responses.
- Manual end-to-end test with simple prompts that should and should not change the board.

Implementation notes:

- The backend exposes `POST /api/ai/chat` for authenticated AI requests.
- The model is instructed to return strict JSON with `assistantMessage` and optional `board`.
- The backend validates the returned JSON against the board schema before applying any update.
- User and assistant messages are persisted in `chat_messages`; assistant rows store the applied board mutation JSON when one exists.
- Live validation confirmed the no-mutation path against the real model without changing the stored board.

Success criteria:

- Every AI response is validated before use.
- The backend can return both chat text and a validated board mutation result.
- Invalid model output cannot corrupt board state.

## Part 10: AI Chat Sidebar UI

Goal: add the chat experience to the app and reflect backend-approved board mutations in the Kanban UI.

Checklist:

- [x] Add a sidebar layout that fits the current visual language.
- [x] Add chat input, message list, and submit state handling.
- [x] Call the backend AI endpoint from the frontend.
- [x] Render user and assistant messages.
- [x] Refresh board data automatically after successful AI-applied mutations.
- [x] Handle non-mutating AI replies cleanly.
- [x] Handle error and loading states.

Tests:

- Frontend unit tests for sidebar rendering and request states.
- End-to-end tests covering chat-only responses and chat-plus-board-update responses.
- Regression tests confirming standard board interactions still work with the sidebar present.

Implementation notes:

- `ChatSidebar` component added at `frontend/src/components/ChatSidebar.tsx`.
- `AppShell` owns AI chat state and calls `POST /api/ai/chat`; it passes `messages`, `onSendMessage`, `isLoading`, and `errorMessage` to the sidebar.
- When `boardUpdated` is `true` in the response the board is updated in place; no extra fetch is needed.
- Authenticated app load also restores persisted chat history from `GET /api/chat-history`.
- AI requests wait for any queued board save to finish before calling `/api/ai/chat`, preventing stale board overwrite races.
- Chat state is cleared on logout or unauthenticated session loss.
- The sidebar stacks below the board on smaller screens and becomes a sticky right rail on larger screens.
- `scrollIntoView` is stubbed in the JSDOM test setup so unit tests pass without browser DOM.
- Live validation: sending an AI message to add a card applied the mutation on the backend and reflected it in the UI in real time.
- Live validation also confirmed chat history reappears after a full page reload.

Success criteria:

- Users can chat with the assistant from the board screen.
- AI-approved board changes appear automatically in the UI.
- Normal Kanban interactions remain stable.

## Cross-Phase Testing Strategy

- Keep fast backend unit tests for services, schema validation, and API routes.
- Keep fast frontend unit tests for component behavior.
- Use Playwright for end-to-end flows that span login, board interactions, and AI flows.
- Add at least one Docker or script-driven smoke test at key packaging milestones.
- Run the narrowest useful test immediately after each implementation slice.

## Confirmed Decisions

- Serve strategy: a static frontend build will be served by FastAPI inside one container.
- MVP auth: use backend-managed session auth.
- Column rules: keep exactly five fixed columns that are renameable only.
- Chat history persistence: store chat history in SQLite.
- Chat history restore: reload the persisted sidebar transcript from the backend after authenticated app load.
- AI response contract: the backend validates and applies structured board mutations; the frontend never applies raw AI mutations directly.
- Frontend AI behavior: serialize AI requests after pending board saves to keep the backend prompt aligned with the latest persisted board.
- Sidebar layout: keep the chat UI in a dedicated sidebar that is responsive on smaller screens and sticky on larger screens.

## Proposed Implementation Order

1. Part 2 scaffolding.
2. Part 3 integrated frontend serving.
3. Part 4 login flow.
4. Part 5 schema approval.
5. Part 6 backend persistence API.
6. Part 7 frontend/backend integration.
7. Part 8 OpenRouter connectivity.
8. Part 9 structured AI mutation flow.
9. Part 10 chat sidebar UI.