# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kanban Studio — a single-user Kanban board app with an AI chat assistant. The backend is a FastAPI app (Python/SQLite) that serves both the API and the pre-built Next.js static frontend. The app is single-user: there is no real auth, just a hardcoded `MVP_USERNAME = "user"` with a session cookie.

## Commands

### Backend

All backend commands run from `backend/`.

```bash
# Install dependencies (uses uv)
uv sync

# Run dev server
uv run uvicorn app.main:app --reload

# Run all tests
uv run pytest

# Run a single test file
uv run pytest tests/test_app.py

# Run a single test
uv run pytest tests/test_app.py::test_name
```

### Frontend

All frontend commands run from `frontend/`.

```bash
npm install
npm run dev          # dev server (port 3000)
npm run build        # static export to frontend/out/
npm run test         # unit tests (vitest)
npm run test:e2e     # e2e tests (playwright)
```

### Docker / scripts

```bash
# macOS: start/stop the full stack
./scripts/start-macos.sh
./scripts/stop-macos.sh
```

The Dockerfile does a two-stage build: Next.js static export → Python image. The FastAPI server serves the static frontend from `frontend/out/`.

## Architecture

### Backend (`backend/app/`)

- **`main.py`** — `create_app()` factory: wires up DB, session serializer, OpenRouter client, security headers middleware, mounts the API router and static files.
- **`api.py`** — All REST endpoints under `/api`. Key routes: `POST /api/login`, `POST /api/logout`, `GET/PUT /api/board`, `POST /api/ai/chat`, `GET /api/chat-history`, `POST /api/ai/connectivity-test`. Includes in-process rate limiting (sliding window, stored in `app.state.rate_limit_store`).
- **`db.py`** — Raw SQLite helpers (no ORM). Schema: `users`, `boards`, `chat_messages`. The board state is stored as a JSON blob in `boards.board_json`.
- **`ai.py`** — Prompt building and response parsing for the AI chat. The AI always returns a JSON object (`StructuredAssistantResponse`) with an `assistantMessage` and optionally an updated `board`. Prompt compaction logic (`BOARD_COMPACTION_STEPS`) trims board content when the prompt would exceed `MAX_PROMPT_CHARS`.
- **`openrouter.py`** — OpenRouter configuration loading and async HTTP client wrapper. Keeps AI secrets server-side only; loads `OPENROUTER_API_KEY` from the repo root `.env`.
- **`schemas.py`** — Pydantic models for request/response validation.
- **`settings.py`** — Loads config from env vars / `.env`. Key vars: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `SESSION_SECRET`. Auth vars: `PM_AUTH_USERNAME` / `PM_AUTH_PASSWORD` (defaults: `user` / `password`). Rate limits: `PM_LOGIN_RATE_LIMIT_ATTEMPTS`, `PM_AI_RATE_LIMIT_ATTEMPTS`, etc. `APP_ENV=production` enables secure cookie and disables dev defaults.
- **`board_seed.py`** — Default board JSON used to seed a new user's board on first login.

### Frontend (`frontend/src/`)

Next.js app with static export (`output: "export"`), React 19, TypeScript, Tailwind CSS v4, `@dnd-kit` for drag-and-drop.

Key components:
- **`components/AppShell.tsx`** — top-level owner of session, board, and AI chat state. Handles login/logout, board fetch/persist, and AI chat requests. Serializes AI calls after pending board saves to prevent stale board overwrites.
- **`components/KanbanBoard.tsx`** — pure board UI accepting controlled `board` + `onBoardChange` props.
- **`components/ChatSidebar.tsx`** — AI chat sidebar; renders messages, loading state, and input. When `boardUpdated: true` comes back from `/api/ai/chat`, the board is updated in place without an extra fetch.
- **`lib/kanban.ts`** — board type definitions (`BoardData`), `moveCard`, `createId`, `initialData`.

### Session / Auth

Sessions use `itsdangerous.URLSafeTimedSerializer` (signed cookies). `POST /api/login` checks username + password against `AppSettings` (configurable via env, defaults to `user`/`password`). The session cookie name is `pm_session`.

### Key Architectural Decisions

- The board has exactly five fixed columns (renameable only, not addable/deletable).
- The AI never mutates board state from the frontend. `POST /api/ai/chat` validates and applies all mutations on the backend; the frontend only reflects the result.
- Board state is stored as a single JSON blob (`boards.board_json`) in the same shape as the frontend `BoardData` type — no normalized card/column tables.
- Chat history is persisted in `chat_messages` and restored on authenticated app load via `GET /api/chat-history`.

### Testing

Backend tests use `pytest` with a real SQLite in-memory DB (`:memory:`). The `conftest.py` provides a `TestClient` fixture. Test files: `test_app.py` (API/integration), `test_ai.py` (prompt building / response parsing), `test_openrouter.py` (OpenRouter request construction and response parsing). Frontend unit tests use vitest + React Testing Library; e2e tests use Playwright.

## Next Planned Work

- Add the frontend chat sidebar and wire it to the structured backend AI route (`POST /api/ai/chat`).
