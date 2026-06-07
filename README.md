# Family Vacation Planner

AI-powered family trip planner built from a Kanban MVP. The app gives each family member a named login, a shared day-by-day trip board, an Unscheduled idea inbox, quick-add link capture, finalized day plans, and an AI chat sidebar backed by OpenRouter.

## Stack

- Frontend: Next.js, React, Tailwind CSS
- Backend: FastAPI, SQLite
- AI: OpenRouter using `openai/gpt-oss-120b`
- Local package/runtime: Python virtualenv, npm
- Deployment target: Vercel frontend + Railway backend

## Key Features

- Named family member login with bcrypt-hashed seeded passwords
- Shared family board backed by SQLite
- Dynamic trip day columns generated from trip start/end dates
- Unscheduled inbox for ideas before assigning them to a day
- Day tabs with itinerary timeline, health chips, and finalized/locked state
- Quick-Add text or URL card creation with AI enrichment
- AI chat sidebar with board and trip context

## Local Development

Run the backend on port 8000:

```powershell
cd backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

Run the frontend on port 3000:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

For frontend dev mode, `frontend/.env.local` should contain:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The FastAPI backend can also serve the exported frontend at `http://localhost:8000` when `frontend/out` exists.

## Login Accounts

All seeded users use password `family2026`.

| Username | Display name |
|---|---|
| `dad` | Dad |
| `mom` | Mom |
| `trija` | Trija |
| `dibesh` | Dibesh |
| `santosh` | Santosh |
| `tripti` | Tripti |
| `shraddha` | Shraddha |
| `trigun` | Trigun |

## Environment Variables

Create `.env` in the repo root for backend configuration when needed:

```text
OPENROUTER_API_KEY=your_openrouter_key
PM_SESSION_SECRET=replace_with_a_long_random_secret
PM_TRUSTED_ORIGINS=http://localhost:3000
```

Production Railway variables should also include:

```text
PM_ENV=production
PM_SESSION_COOKIE_SECURE=true
PM_DB_PATH=/app/data/pm.db
PM_TRUSTED_ORIGINS=https://your-vercel-app.vercel.app
```

## Tests

Backend:

```powershell
cd backend
.venv\Scripts\pytest.exe
```

Frontend unit tests:

```powershell
cd frontend
npm run test:unit
```

Frontend end-to-end tests:

```powershell
cd frontend
npm run test:e2e
```

## Docker

Build and run locally with the scripts:

```powershell
.\scripts\start-windows.ps1
```

Stop the container:

```powershell
.\scripts\stop-windows.ps1
```

The container exposes the app on:

```text
http://127.0.0.1:8000
```

## Documentation

- [docs/PLAN.md](docs/PLAN.md) is the single source of truth for the engineering plan and family vacation planner product direction.
- [docs/DATABASE.md](docs/DATABASE.md) describes the SQLite persistence approach.
- [docs/todos.md](docs/todos.md) tracks remaining hardening and UI/UX work.

## Notes

- SQLite database path defaults to `backend/data/pm.db`.
- Deleting `backend/data/pm.db` resets local seed data on next backend startup.
- The current local seed trip is Vancouver and Whistler, June 28 through July 3, 2026.
