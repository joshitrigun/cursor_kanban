# Backend Guide

## Purpose

This directory contains the FastAPI backend for the Project Management MVP. It serves the exported frontend, owns MVP session auth and board persistence, and now contains the backend-only OpenRouter connectivity slice used to validate AI access before structured board mutations are introduced.

## Current Structure

- `app/main.py`
	FastAPI application entrypoint.
- `app/db.py`
	SQLite initialization and board persistence helpers.
- `app/board_seed.py`
	Default board data used to seed the MVP user.
- `app/openrouter.py`
	OpenRouter configuration loading and backend client wrapper.
- `tests/test_app.py`
	Backend route and persistence tests.
- `tests/test_openrouter.py`
	Backend unit tests for OpenRouter request construction and response parsing.
- `pyproject.toml`
	Python project metadata and dependencies managed with `uv`.

## Current Behavior

- Serves the built frontend export at `/` when [frontend/out](d:\learn\pm\pm\frontend\out) exists.
- Falls back to placeholder HTML at `/` when the frontend export is not available.
- Serves JSON health information at `/api/health`.
- Serves backend-managed session endpoints at `/api/session`, `/api/login`, and `/api/logout`.
- Serves board persistence endpoints at `/api/board` for authenticated users.
- Serves a backend-only OpenRouter diagnostic route at `/api/ai/connectivity-test` for authenticated users.
- Serves a structured backend AI chat route at `/api/ai/chat` for authenticated users.
- Uses an HTTP-only cookie for the MVP login session.
- Creates the SQLite database automatically and seeds the MVP user and default board.
- Loads `OPENROUTER_API_KEY` from the repo root `.env` file and keeps AI secrets server-side only.
- Persists AI chat history in `chat_messages` and only applies validated board documents on the backend.
- Uses `uvicorn` as the ASGI server.
- Uses `pytest` and FastAPI `TestClient` for backend testing.

## Next Planned Responsibilities

- Add the frontend chat sidebar and wire it to the structured backend AI route in the next phase.