from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Union
from uuid import uuid4

import bcrypt

from app.board_seed import make_default_board

SCHEMA_VERSION = 1
IN_MEMORY_DB_PATH = ":memory:"

FAMILY_BOARD_OWNER = "dad"

SEED_USERS = [
    {"username": "dad",      "display_name": "Dad",      "password": "family2026"},
    {"username": "mom",      "display_name": "Mom",      "password": "family2026"},
    {"username": "trija",    "display_name": "Trija",    "password": "family2026"},
    {"username": "dibesh",   "display_name": "Dibesh",   "password": "family2026"},
    {"username": "santosh",  "display_name": "Santosh",  "password": "family2026"},
    {"username": "tripti",   "display_name": "Tripti",   "password": "family2026"},
    {"username": "shraddha", "display_name": "Shraddha", "password": "family2026"},
    {"username": "trigun",   "display_name": "Trigun",   "password": "family2026"},
]

SEED_TRIP = {
    "name": "Vancouver & Whistler Family Trip",
    "destination": "Whistler & Vancouver, BC",
    "start_date": "2026-06-28",
    "end_date": "2026-07-03",
}


class BoardNotFoundError(LookupError):
    pass


def default_db_path() -> Path:
    env_path = os.getenv("PM_DB_PATH")
    if env_path:
        return Path(env_path)
    return Path(__file__).resolve().parents[1] / "data" / "pm.db"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _use_postgres() -> bool:
    return bool(os.getenv("DATABASE_URL"))


class Row(dict):
    """Dict subclass that also supports integer-index access (for fetchone()[0] patterns)."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class _Result:
    """Unified fetch interface for both sqlite3 and psycopg2 cursors."""

    def __init__(self, cur, postgres: bool) -> None:
        self._cur = cur
        self._postgres = postgres

    def _columns(self) -> list[str]:
        return [d[0] for d in (self._cur.description or [])]

    def _to_row(self, raw) -> Optional[Row]:
        if raw is None:
            return None
        if self._postgres:
            return Row(zip(self._columns(), raw))
        return Row(zip(raw.keys(), tuple(raw)))

    def fetchone(self) -> Optional[Row]:
        return self._to_row(self._cur.fetchone())

    def fetchall(self) -> list[Row]:
        rows = self._cur.fetchall()
        if self._postgres:
            cols = self._columns()
            return [Row(zip(cols, r)) for r in rows]
        return [Row(zip(r.keys(), tuple(r))) for r in rows]


class Connection:
    """Thin wrapper over sqlite3 or psycopg2 that normalises placeholder style and row access."""

    def __init__(self, raw, postgres: bool = False) -> None:
        self._raw = raw
        self._postgres = postgres

    def _adapt(self, sql: str) -> str:
        if self._postgres:
            return sql.replace("?", "%s")
        return sql

    def execute(self, sql: str, params: tuple = ()) -> _Result:
        if self._postgres:
            cur = self._raw.cursor()
            cur.execute(self._adapt(sql), params)
            return _Result(cur, postgres=True)
        result = self._raw.execute(sql, params)
        return _Result(result, postgres=False)

    def commit(self) -> None:
        self._raw.commit()

    def close(self) -> None:
        self._raw.close()


def connect(db_path: Union[str, Path, None] = None) -> Connection:
    # Use Postgres only when no explicit path is given AND DATABASE_URL is set.
    # An explicit db_path (including IN_MEMORY_DB_PATH for tests) always means SQLite.
    if db_path is None and _use_postgres():
        import psycopg2  # type: ignore[import]

        raw = psycopg2.connect(os.environ["DATABASE_URL"])
        raw.autocommit = False
        return Connection(raw, postgres=True)

    if db_path is None:
        db_path = default_db_path()
    if db_path != IN_MEMORY_DB_PATH:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    raw = sqlite3.connect(str(db_path), check_same_thread=False)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    return Connection(raw, postgres=False)


def initialize_database(connection: Connection) -> None:
    for stmt in [
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL DEFAULT '',
            hashed_password TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS trips (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT '',
            destination TEXT NOT NULL DEFAULT '',
            start_date TEXT,
            end_date TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS boards (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            board_json TEXT NOT NULL,
            board_version INTEGER NOT NULL DEFAULT 1,
            schema_version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            message_order INTEGER NOT NULL,
            board_mutation_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_chat_messages_board_order
            ON chat_messages (board_id, message_order)
        """,
    ]:
        connection.execute(stmt)

    _migrate_users_table(connection)
    _seed_accounts(connection)
    _seed_trip(connection)
    connection.commit()


def _migrate_users_table(connection: Connection) -> None:
    # PRAGMA is SQLite-only; Postgres always starts with the full schema.
    if _use_postgres():
        return
    existing = {
        row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    if "display_name" not in existing:
        connection.execute(
            "ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"
        )
    if "hashed_password" not in existing:
        connection.execute("ALTER TABLE users ADD COLUMN hashed_password TEXT")


def _seed_accounts(connection: Connection) -> None:
    for seed in SEED_USERS:
        _ensure_seeded_user(
            connection, seed["username"], seed["display_name"], seed["password"]
        )


def _ensure_seeded_user(
    connection: Connection,
    username: str,
    display_name: str,
    plain_password: str,
) -> None:
    now = utc_now()
    user_row = connection.execute(
        "SELECT id, hashed_password FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    if user_row is None:
        user_id = f"user-{uuid4().hex}"
        hashed = bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()
        connection.execute(
            """INSERT INTO users (id, username, display_name, hashed_password, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, username, display_name, hashed, now, now),
        )
        user_id_val = user_id
    else:
        user_id_val = user_row["id"]
        if not user_row["hashed_password"]:
            hashed = bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()
            connection.execute(
                "UPDATE users SET hashed_password = ?, updated_at = ? WHERE id = ?",
                (hashed, now, user_id_val),
            )

    board_row = connection.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_id_val,)
    ).fetchone()

    if board_row is None:
        connection.execute(
            """INSERT INTO boards
               (id, user_id, board_json, board_version, schema_version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                f"board-{uuid4().hex}",
                user_id_val,
                json.dumps(make_default_board(SEED_TRIP["start_date"], SEED_TRIP["end_date"])),
                1,
                SCHEMA_VERSION,
                now,
                now,
            ),
        )


def _seed_trip(connection: Connection) -> None:
    owner_row = connection.execute(
        "SELECT id FROM users WHERE username = ?", (FAMILY_BOARD_OWNER,)
    ).fetchone()
    if owner_row is None:
        return
    existing = connection.execute(
        "SELECT id FROM trips WHERE user_id = ?", (owner_row["id"],)
    ).fetchone()
    if existing is None:
        now = utc_now()
        connection.execute(
            """INSERT INTO trips
               (id, user_id, name, destination, start_date, end_date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"trip-{uuid4().hex}",
                owner_row["id"],
                SEED_TRIP["name"],
                SEED_TRIP["destination"],
                SEED_TRIP["start_date"],
                SEED_TRIP["end_date"],
                now,
                now,
            ),
        )


def get_user_for_auth(connection: Connection, username: str) -> Row | None:
    return connection.execute(
        "SELECT id, username, display_name, hashed_password FROM users WHERE username = ?",
        (username,),
    ).fetchone()


def get_board_for_username(connection: Connection, username: str) -> dict[str, object]:
    board_row = get_board_row_for_username(connection, username)
    return {
        "board": json.loads(board_row["board_json"]),
        "boardVersion": board_row["board_version"],
        "schemaVersion": board_row["schema_version"],
    }


def update_board_for_username(
    connection: Connection,
    username: str,
    board: dict[str, object],
) -> dict[str, object]:
    existing_row = get_board_row_for_username(connection, username)
    next_board_version = existing_row["board_version"] + 1
    now = utc_now()

    connection.execute(
        """UPDATE boards
           SET board_json = ?, board_version = ?, schema_version = ?, updated_at = ?
           WHERE id = ?""",
        (json.dumps(board), next_board_version, SCHEMA_VERSION, now, existing_row["id"]),
    )
    connection.commit()

    return {
        "board": board,
        "boardVersion": next_board_version,
        "schemaVersion": SCHEMA_VERSION,
    }


def get_board_row_for_username(connection: Connection, username: str) -> Row:
    # All family members share the board owned by FAMILY_BOARD_OWNER.
    owner_row = connection.execute(
        "SELECT id FROM users WHERE username = ?", (FAMILY_BOARD_OWNER,)
    ).fetchone()
    if owner_row is None:
        owner_row = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
    if owner_row is None:
        raise BoardNotFoundError(f"User '{username}' not found.")

    board_row = connection.execute(
        "SELECT id, board_json, board_version, schema_version FROM boards WHERE user_id = ?",
        (owner_row["id"],),
    ).fetchone()
    if board_row is None:
        raise BoardNotFoundError("Shared family board not found.")
    return board_row


def get_chat_history_for_username(
    connection: Connection,
    username: str,
) -> list[dict[str, Any]]:
    board_row = get_board_row_for_username(connection, username)
    rows = connection.execute(
        """SELECT role, content, board_mutation_json
           FROM chat_messages
           WHERE board_id = ?
           ORDER BY message_order ASC""",
        (board_row["id"],),
    ).fetchall()

    history: list[dict[str, Any]] = []
    for row in rows:
        message: dict[str, Any] = {"role": row["role"], "content": row["content"]}
        if row["board_mutation_json"]:
            message["boardMutation"] = json.loads(row["board_mutation_json"])
        history.append(message)
    return history


def append_chat_exchange_for_username(
    connection: Connection,
    username: str,
    user_message: str,
    assistant_message: str,
    board_mutation: Optional[dict[str, Any]] = None,
) -> None:
    board_row = get_board_row_for_username(connection, username)
    result = connection.execute(
        "SELECT COALESCE(MAX(message_order), 0) AS max_order FROM chat_messages WHERE board_id = ?",
        (board_row["id"],),
    ).fetchone()
    current_order = result["max_order"]
    now = utc_now()

    connection.execute(
        """INSERT INTO chat_messages
           (id, board_id, role, content, message_order, board_mutation_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (f"msg-{uuid4().hex}", board_row["id"], "user", user_message, current_order + 1, None, now),
    )
    connection.execute(
        """INSERT INTO chat_messages
           (id, board_id, role, content, message_order, board_mutation_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            f"msg-{uuid4().hex}",
            board_row["id"],
            "assistant",
            assistant_message,
            current_order + 2,
            json.dumps(board_mutation) if board_mutation is not None else None,
            now,
        ),
    )
    connection.commit()


def get_trip_for_user(connection: Connection, username: str) -> dict[str, Any] | None:
    user_row = connection.execute(
        "SELECT id FROM users WHERE username = ?", (FAMILY_BOARD_OWNER,)
    ).fetchone()
    if user_row is None:
        return None

    trip_row = connection.execute(
        "SELECT name, destination, start_date, end_date FROM trips WHERE user_id = ?",
        (user_row["id"],),
    ).fetchone()
    if trip_row is None:
        return None

    return {
        "name": trip_row["name"],
        "destination": trip_row["destination"],
        "startDate": trip_row["start_date"],
        "endDate": trip_row["end_date"],
    }


def upsert_trip_for_user(
    connection: Connection,
    username: str,
    name: str,
    destination: str,
    start_date: str | None,
    end_date: str | None,
) -> dict[str, Any]:
    user_row = connection.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user_row is None:
        raise BoardNotFoundError(f"User '{username}' not found.")

    now = utc_now()
    existing = connection.execute(
        "SELECT id FROM trips WHERE user_id = ?", (user_row["id"],)
    ).fetchone()

    if existing is None:
        connection.execute(
            """INSERT INTO trips
               (id, user_id, name, destination, start_date, end_date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (f"trip-{uuid4().hex}", user_row["id"], name, destination, start_date, end_date, now, now),
        )
    else:
        connection.execute(
            """UPDATE trips
               SET name = ?, destination = ?, start_date = ?, end_date = ?, updated_at = ?
               WHERE user_id = ?""",
            (name, destination, start_date, end_date, now, user_row["id"]),
        )
    connection.commit()

    return {
        "name": name,
        "destination": destination,
        "startDate": start_date,
        "endDate": end_date,
    }
