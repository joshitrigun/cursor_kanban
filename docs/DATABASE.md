# Database Design

This document proposes the SQLite schema for the MVP persistence layer.

## Goals

- Support one board per signed-in user for the MVP.
- Keep the data model simple and easy to migrate.
- Store the Kanban board as JSON so the backend can persist the existing frontend shape directly.
- Keep a future path open for multiple users and AI chat history.
- Make backend validation and persistence straightforward in Part 6 and Part 7.

## Recommended Storage Model

Use one SQLite database file.

- Suggested path: `backend/data/pm.db`
- Enable `PRAGMA foreign_keys = ON`
- Create the database automatically on first startup

## Schema Overview

Use three tables in the MVP:

1. `users`
2. `boards`
3. `chat_messages`

This keeps the board as a single JSON document while preserving enough relational structure for ownership, auditing, and future AI history.

## Table: `users`

Purpose: identify the owner of a board.

Recommended columns:

- `id TEXT PRIMARY KEY`
- `username TEXT NOT NULL UNIQUE`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Notes:

- For the MVP, seed or create the single user row for `user`.
- The current login flow is still hardcoded in the backend, so this table is about ownership and future expansion rather than full auth storage.
- If auth later moves into the database, add auth-specific columns then rather than over-designing now.

## Table: `boards`

Purpose: store exactly one Kanban board per user.

Recommended columns:

- `id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE`
- `board_json TEXT NOT NULL`
- `board_version INTEGER NOT NULL DEFAULT 1`
- `schema_version INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Notes:

- `user_id UNIQUE` enforces one board per user for the MVP.
- `board_json` stores the full board document in the same shape as the frontend `BoardData` type.
- `board_version` increments on each successful board write. This gives the backend a simple optimistic-concurrency hook later if needed.
- `schema_version` tracks the persisted JSON shape independently from database migrations.

## Table: `chat_messages`

Purpose: store per-board AI conversation history for future context.

Recommended columns:

- `id TEXT PRIMARY KEY`
- `board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE`
- `role TEXT NOT NULL`
- `content TEXT NOT NULL`
- `message_order INTEGER NOT NULL`
- `board_mutation_json TEXT`
- `created_at TEXT NOT NULL`

Notes:

- `role` should be constrained in application code to `user`, `assistant`, or `system`.
- `message_order` keeps retrieval simple and deterministic.
- `board_mutation_json` stores the validated structured mutation applied from an AI response when one exists. Leave it `NULL` for normal chat messages.
- This table is enough for MVP chat history without inventing separate conversation/session tables yet.

## Recommended DDL

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    board_json TEXT NOT NULL,
    board_version INTEGER NOT NULL DEFAULT 1,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    message_order INTEGER NOT NULL,
    board_mutation_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_board_order
    ON chat_messages (board_id, message_order);
```

## Board JSON Shape

Persist the board in the same logical shape already used in the frontend.

Example:

```json
{
  "columns": [
    {
      "id": "col-backlog",
      "title": "Backlog",
      "cardIds": ["card-1", "card-2"]
    }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Align roadmap themes",
      "details": "Draft quarterly themes with impact statements and metrics."
    }
  }
}
```

Why keep the board as JSON:

- It matches the current frontend state shape directly.
- It keeps Part 6 and Part 7 implementation smaller.
- It avoids premature normalization of cards and columns before the product model settles.
- It works cleanly with AI prompts, since the backend can pass the board document directly.

## Versioning Strategy

Use two version numbers:

- `board_version`
  Increment each time the board changes.
- `schema_version`
  Increment only when the JSON shape itself changes.

Recommendation:

- Start both at `1`.
- In Part 6, every successful board update should increase `board_version` by `1`.
- Only change `schema_version` when the persisted board structure changes in a way that needs migration logic.

## Initialization Strategy

On backend startup in Part 6:

1. Ensure the SQLite file directory exists.
2. Open the database.
3. Enable foreign keys.
4. Create tables if they do not exist.
5. Ensure the MVP `user` row exists.
6. Ensure that user has one default board row.

## Why Not Normalize Columns And Cards Yet

That is possible, but it adds complexity before it creates value.

Reasons to avoid it in the MVP:

- The frontend already manages a board-sized JSON document.
- The AI integration wants the full board as context anyway.
- The app currently updates the board as a whole, not as independent card transactions.
- Keeping one JSON payload reduces migration work while the interaction model is still changing.

If the product later needs querying across cards, reporting, or cross-board analytics, that is the right time to split cards and columns into separate tables.

## Approval Requested

This proposal is the recommended Part 5 design.

If approved, Part 6 should implement:

- database creation on startup
- seed/create of the MVP user and default board
- board load and update endpoints using `boards.board_json`
- chat history persistence using `chat_messages`