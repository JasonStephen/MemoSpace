from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / 'memory.db'


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    def table_exists(conn: sqlite3.Connection, table: str) -> bool:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone()
        return row is not None

    def has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
        rows = conn.execute(f'PRAGMA table_info({table})').fetchall()
        return any(row['name'] == column for row in rows)

    def table_row_count(conn: sqlite3.Connection, table: str) -> int:
        row = conn.execute(f'SELECT COUNT(1) AS total FROM {table}').fetchone()
        return int(row['total']) if row else 0

    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS public_music_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                icon_url TEXT DEFAULT '',
                title TEXT DEFAULT '',
                artist TEXT DEFAULT '',
                memory_time TEXT DEFAULT '',
                tags_json TEXT DEFAULT '[]',
                color TEXT DEFAULT '#6d5efc',
                short_desc TEXT DEFAULT '',
                long_desc TEXT DEFAULT '',
                links_json TEXT DEFAULT '{}',
                hidden INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS public_cognition_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT '',
                memory_time TEXT DEFAULT '',
                tags_json TEXT DEFAULT '[]',
                color TEXT DEFAULT '#18a999',
                short_desc TEXT DEFAULT '',
                long_desc TEXT DEFAULT '',
                hidden INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS personal_music_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                icon_url TEXT DEFAULT '',
                title TEXT DEFAULT '',
                artist TEXT DEFAULT '',
                memory_time TEXT DEFAULT '',
                tags_json TEXT DEFAULT '[]',
                color TEXT DEFAULT '#6d5efc',
                short_desc TEXT DEFAULT '',
                long_desc TEXT DEFAULT '',
                links_json TEXT DEFAULT '{}',
                hidden INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS personal_cognition_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT '',
                memory_time TEXT DEFAULT '',
                tags_json TEXT DEFAULT '[]',
                color TEXT DEFAULT '#18a999',
                short_desc TEXT DEFAULT '',
                long_desc TEXT DEFAULT '',
                hidden INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # Migrate legacy single-space tables into personal space on first upgrade.
        if table_exists(conn, 'music_memory'):
            if not has_column(conn, 'music_memory', 'hidden'):
                conn.execute('ALTER TABLE music_memory ADD COLUMN hidden INTEGER DEFAULT 0')
            if table_row_count(conn, 'personal_music_memory') == 0:
                conn.execute(
                    """
                    INSERT INTO personal_music_memory (
                        icon_url, title, artist, memory_time, tags_json, color,
                        short_desc, long_desc, links_json, hidden, created_at, updated_at
                    )
                    SELECT
                        icon_url, title, artist, memory_time, tags_json, color,
                        short_desc, long_desc, links_json, hidden, created_at, updated_at
                    FROM music_memory
                    """
                )

        if table_exists(conn, 'cognition_memory'):
            if not has_column(conn, 'cognition_memory', 'hidden'):
                conn.execute('ALTER TABLE cognition_memory ADD COLUMN hidden INTEGER DEFAULT 0')
            if table_row_count(conn, 'personal_cognition_memory') == 0:
                conn.execute(
                    """
                    INSERT INTO personal_cognition_memory (
                        title, memory_time, tags_json, color, short_desc,
                        long_desc, hidden, created_at, updated_at
                    )
                    SELECT
                        title, memory_time, tags_json, color, short_desc,
                        long_desc, hidden, created_at, updated_at
                    FROM cognition_memory
                    """
                )
        conn.commit()


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(query, params).fetchone()
    return dict(row) if row else None


def execute(query: str, params: tuple[Any, ...] = ()) -> int:
    with get_connection() as conn:
        cur = conn.execute(query, params)
        conn.commit()
        return cur.lastrowid
