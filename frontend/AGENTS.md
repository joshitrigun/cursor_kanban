# Frontend Guide

## Purpose

This directory contains the Next.js frontend for the Project Management MVP. The app is statically exported and served by the FastAPI backend at `/`.

## Key Components

- `src/app/page.tsx` — renders `AppShell`, the top-level component.
- `src/components/AppShell.tsx` — owns session, board, and AI chat state. Handles login/logout, board fetch/persist, and AI chat requests.
- `src/components/KanbanBoard.tsx` — pure board UI; accepts controlled `board` + `onBoardChange` props or runs with internal state for unit tests.
- `src/components/ChatSidebar.tsx` — AI chat sidebar with message list, loading state, input, and send button.
- `src/lib/kanban.ts` — board type definitions, `moveCard`, `createId`, and `initialData`.

## Current Behavior

- Unauthenticated users see the login form. Login posts to `/api/login`.
- After login, `AppShell` fetches the board from `/api/board` via the session-change effect.
- Board mutations (drag, add, rename, delete) are persisted to `/api/board` via PUT.
- The AI chat sidebar calls `POST /api/ai/chat`; if `boardUpdated` is `true`, the board is updated in place from the response.
- Logout calls `/api/logout` and resets session, board, and chat state.

## Testing

- `npm run test:unit` — Vitest + Testing Library; 16 tests across `kanban.test.ts`, `ChatSidebar.test.tsx`, `AppShell.test.tsx`, `KanbanBoard.test.tsx`.
- `npm run build` — Next.js static export to `frontend/out/`; must succeed before the backend can serve the updated app.

## Current Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- `@dnd-kit` for drag and drop
- Vitest and Testing Library for unit tests
- Playwright for end-to-end tests

## Current Entry Points

- [src/app/page.tsx](d:\learn\pm\pm\frontend\src\app\page.tsx) renders the Kanban board directly.
- [src/app/layout.tsx](d:\learn\pm\pm\frontend\src\app\layout.tsx) defines the app shell.
- [src/app/globals.css](d:\learn\pm\pm\frontend\src\app\globals.css) holds the visual system and global styles.

## Current Behavior

- Renders a login screen at `/` until the backend session is authenticated.
- Uses the hardcoded MVP credentials `user` / `password` via backend-managed session routes.
- Loads the board from `/api/board` after login.
- Renders one Kanban board at `/` after login.
- Shows five columns by default.
- Allows column titles to be renamed inline.
- Allows cards to be added to a column.
- Allows cards to be deleted.
- Allows cards to be dragged within a column or across columns.
- Allows the user to log out back to the login screen.
- Persists board changes through `/api/board` so they survive refresh.
- Does not implement board persistence or AI chat yet.

## Important Components

- [src/components/AppShell.tsx](d:\learn\pm\pm\frontend\src\components\AppShell.tsx)
  Owns session fetch, board fetch, login form behavior, logout flow, and board persistence.
- [src/components/KanbanBoard.tsx](d:\learn\pm\pm\frontend\src\components\KanbanBoard.tsx)
  Renders the board interactions and can operate with either internal or externally controlled board state.
- [src/components/KanbanColumn.tsx](d:\learn\pm\pm\frontend\src\components\KanbanColumn.tsx)
  Renders a column, rename control, card list, and add-card UI.
- [src/components/KanbanCard.tsx](d:\learn\pm\pm\frontend\src\components\KanbanCard.tsx)
  Renders an individual card.
- [src/components/KanbanCardPreview.tsx](d:\learn\pm\pm\frontend\src\components\KanbanCardPreview.tsx)
  Renders the drag overlay preview.
- [src/components/NewCardForm.tsx](d:\learn\pm\pm\frontend\src\components\NewCardForm.tsx)
  Renders the inline new-card form.

## Important Library Code

- [src/lib/kanban.ts](d:\learn\pm\pm\frontend\src\lib\kanban.ts)
  Defines board types, seed data, card movement logic, and ID generation.

## Test Surface

- [src/components/AppShell.test.tsx](d:\learn\pm\pm\frontend\src\components\AppShell.test.tsx)
  Covers unauthenticated load, successful login, authenticated board load, and invalid credentials.
- [src/components/KanbanBoard.test.tsx](d:\learn\pm\pm\frontend\src\components\KanbanBoard.test.tsx)
  Covers rendering, column rename, and add/remove card behavior.
- [src/lib/kanban.test.ts](d:\learn\pm\pm\frontend\src\lib\kanban.test.ts)
  Covers board utility logic.
- [tests/kanban.spec.ts](d:\learn\pm\pm\frontend\tests\kanban.spec.ts)
  Covers browser-level rendering, add-card flow, and drag-and-drop.

## Working Assumptions For Future Changes

- Treat the current UI and behaviors as the baseline to preserve when integrating the backend.
- Keep the visual style unless the user asks for a redesign.
- Once persistence exists, move source-of-truth board state to the backend and keep the frontend thin.
- Keep authentication server-owned and let the frontend consume session state rather than invent its own auth model.
- Add new app flows incrementally so existing board interactions keep passing tests.

## Commands

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Run unit tests: `npm run test:unit`
- Run end-to-end tests: `npm run test:e2e`
- Run all frontend tests: `npm run test:all`