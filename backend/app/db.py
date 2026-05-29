from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.board_seed import DEFAULT_BOARD

SCHEMA_VERSION = 1
MVP_USERNAME = "user"
IN_MEMORY_DB_PATH = ":memory:"


class BoardNotFoundError(LookupError):
    pass


def default_db_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "pm.db"


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def connect(db_path: str | Path) -> sqlite3.Connection:
    if db_path != IN_MEMORY_DB_PATH:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
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
        """
    )

    ensure_user_and_board(connection, MVP_USERNAME)
    connection.commit()


def ensure_user_and_board(connection: sqlite3.Connection, username: str) -> sqlite3.Row:
    now = utc_now()
    user_row = connection.execute(
        "SELECT id, username FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    if user_row is None:
        user_id = f"user-{uuid4().hex}"
        connection.execute(
            "INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (user_id, username, now, now),
        )
        user_row = connection.execute(
            "SELECT id, username FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    board_row = connection.execute(
        "SELECT id FROM boards WHERE user_id = ?",
        (user_row["id"],),
    ).fetchone()

    if board_row is None:
        connection.execute(
            """
            INSERT INTO boards (
                id, user_id, board_json, board_version, schema_version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"board-{uuid4().hex}",
                user_row["id"],
                json.dumps(DEFAULT_BOARD),
                1,
                SCHEMA_VERSION,
                now,
                now,
            ),
        )

    return user_row


def get_board_for_username(connection: sqlite3.Connection, username: str) -> dict[str, object]:
    board_row = get_board_row_for_username(connection, username)
    return {
        "board": json.loads(board_row["board_json"]),
        "boardVersion": board_row["board_version"],
        "schemaVersion": board_row["schema_version"],
    }


def update_board_for_username(
    connection: sqlite3.Connection,
    username: str,
    board: dict[str, object],
) -> dict[str, object]:
    existing_row = get_board_row_for_username(connection, username)

    next_board_version = existing_row["board_version"] + 1
    now = utc_now()

    connection.execute(
        """
        UPDATE boards
        SET board_json = ?, board_version = ?, schema_version = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            json.dumps(board),
            next_board_version,
            SCHEMA_VERSION,
            now,
            existing_row["id"],
        ),
    )
    connection.commit()

    return {
        "board": board,
        "boardVersion": next_board_version,
        "schemaVersion": SCHEMA_VERSION,
    }


def get_board_row_for_username(connection: sqlite3.Connection, username: str) -> sqlite3.Row:
    user_row = ensure_user_and_board(connection, username)
    board_row = connection.execute(
        """
        SELECT id, board_json, board_version, schema_version
        FROM boards
        WHERE user_id = ?
        """,
        (user_row["id"],),
    ).fetchone()
    if board_row is None:
        raise BoardNotFoundError(f"Board not found for username '{username}'.")
    return board_row


def get_chat_history_for_username(
    connection: sqlite3.Connection,
    username: str,
) -> list[dict[str, Any]]:
    board_row = get_board_row_for_username(connection, username)
    rows = connection.execute(
        """
        SELECT role, content, board_mutation_json
        FROM chat_messages
        WHERE board_id = ?
        ORDER BY message_order ASC
        """,
        (board_row["id"],),
    ).fetchall()

    history: list[dict[str, Any]] = []
    for row in rows:
        message = {"role": row["role"], "content": row["content"]}
        if row["board_mutation_json"]:
            message["boardMutation"] = json.loads(row["board_mutation_json"])
        history.append(message)

    return history


def append_chat_exchange_for_username(
    connection: sqlite3.Connection,
    username: str,
    user_message: str,
    assistant_message: str,
    board_mutation: dict[str, Any] | None = None,
) -> None:
    board_row = get_board_row_for_username(connection, username)
    current_order = connection.execute(
        "SELECT COALESCE(MAX(message_order), 0) FROM chat_messages WHERE board_id = ?",
        (board_row["id"],),
    ).fetchone()[0]
    now = utc_now()

    connection.execute(
        """
        INSERT INTO chat_messages (id, board_id, role, content, message_order, board_mutation_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"msg-{uuid4().hex}",
            board_row["id"],
            "user",
            user_message,
            current_order + 1,
            None,
            now,
        ),
    )
    connection.execute(
        """
        INSERT INTO chat_messages (id, board_id, role, content, message_order, board_mutation_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
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