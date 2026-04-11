from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Mapping

ROOT_DIR = Path(__file__).parent
DEFAULT_DB_PATH = ROOT_DIR / "data" / "kmtid_history.sqlite3"


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS kmtid_starts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    race_id TEXT,
    race_number INTEGER,
    horse_name TEXT NOT NULL,
    normalized_horse_name TEXT NOT NULL,
    first200ms REAL,
    last200ms REAL,
    best100ms REAL,
    actual_km_time REAL,
    slipstream_distance REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kmtid_starts_normalized_horse_name
    ON kmtid_starts(normalized_horse_name);

CREATE INDEX IF NOT EXISTS idx_kmtid_starts_date
    ON kmtid_starts(date);

CREATE INDEX IF NOT EXISTS idx_kmtid_starts_race_number
    ON kmtid_starts(race_number);
"""

_SELECT_FIELDS_SQL = """
SELECT
    date,
    race_id,
    race_number,
    horse_name,
    normalized_horse_name,
    first200ms,
    last200ms,
    best100ms,
    actual_km_time,
    slipstream_distance,
    created_at,
    dedupe_key
FROM kmtid_starts
"""


def _resolve_db_path(db_path: str | Path | None = None) -> Path:
    return Path(db_path) if db_path is not None else DEFAULT_DB_PATH


def _get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = _resolve_db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def _value_from_start(start: Mapping[str, Any], snake_key: str, camel_key: str) -> Any:
    if snake_key in start:
        return start.get(snake_key)
    return start.get(camel_key)


def build_dedupe_key(
    date: Any,
    race_id: Any,
    race_number: Any,
    normalized_horse_name: Any,
) -> str:
    return (
        f"{date or ''}|{race_id or ''}|{race_number or ''}|"
        f"{normalized_horse_name or ''}"
    )


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "date": row["date"],
        "raceId": row["race_id"],
        "raceNumber": row["race_number"],
        "horseName": row["horse_name"],
        "normalizedHorseName": row["normalized_horse_name"],
        "first200ms": row["first200ms"],
        "last200ms": row["last200ms"],
        "best100ms": row["best100ms"],
        "actualKMTime": row["actual_km_time"],
        "slipstreamDistance": row["slipstream_distance"],
        "createdAt": row["created_at"],
        "dedupeKey": row["dedupe_key"],
    }


def _create_table(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


def _migrate_if_needed(conn: sqlite3.Connection) -> None:
    has_dedupe_key = _table_has_column(conn, "kmtid_starts", "dedupe_key")
    if has_dedupe_key:
        # Ensure dedupe_key is populated for legacy rows where it may be empty.
        rows = conn.execute(
            """
            SELECT id, date, race_id, race_number, normalized_horse_name, horse_name
            FROM kmtid_starts
            WHERE dedupe_key IS NULL OR dedupe_key = ''
            """
        ).fetchall()
        for row in rows:
            normalized_name = row["normalized_horse_name"] or normalize_horse_name(row["horse_name"])
            dedupe_key = build_dedupe_key(
                row["date"],
                row["race_id"],
                row["race_number"],
                normalized_name,
            )
            try:
                conn.execute(
                """
                UPDATE kmtid_starts
                SET dedupe_key = ?, normalized_horse_name = ?
                WHERE id = ?
                """,
                (dedupe_key, normalized_name, row["id"]),
                )
            except sqlite3.IntegrityError:
                # If a duplicate key already exists from legacy data, drop this row.
                conn.execute("DELETE FROM kmtid_starts WHERE id = ?", (row["id"],))
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_kmtid_starts_dedupe_key
            ON kmtid_starts(dedupe_key)
            """
        )
        return

    conn.execute("ALTER TABLE kmtid_starts RENAME TO kmtid_starts_legacy")
    _create_table(conn)

    legacy_rows = conn.execute(
        """
        SELECT
            date,
            race_id,
            race_number,
            horse_name,
            normalized_horse_name,
            first200ms,
            last200ms,
            best100ms,
            actual_km_time,
            slipstream_distance,
            created_at
        FROM kmtid_starts_legacy
        """
    ).fetchall()

    for row in legacy_rows:
        normalized_name = row["normalized_horse_name"] or normalize_horse_name(row["horse_name"])
        dedupe_key = build_dedupe_key(
            row["date"],
            row["race_id"],
            row["race_number"],
            normalized_name,
        )

        conn.execute(
            """
            INSERT OR IGNORE INTO kmtid_starts (
                date,
                dedupe_key,
                race_id,
                race_number,
                horse_name,
                normalized_horse_name,
                first200ms,
                last200ms,
                best100ms,
                actual_km_time,
                slipstream_distance,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["date"],
                dedupe_key,
                row["race_id"] or "",
                row["race_number"],
                row["horse_name"] or "",
                normalized_name,
                row["first200ms"],
                row["last200ms"],
                row["best100ms"],
                row["actual_km_time"],
                row["slipstream_distance"],
                row["created_at"],
            ),
        )

    conn.execute("DROP TABLE IF EXISTS kmtid_starts_legacy")


def normalize_horse_name(horse_name: str) -> str:
    # Lowercase and collapse whitespace so lookups remain stable.
    compact = re.sub(r"\s+", " ", (horse_name or "").strip())
    return compact.casefold()


def init_kmtid_history_store(db_path: str | Path | None = None) -> None:
    with _get_connection(db_path) as conn:
        _create_table(conn)
        _migrate_if_needed(conn)


def load_kmtid_history(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    return get_all_history(db_path)


def get_all_history(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    init_kmtid_history_store(db_path)
    with _get_connection(db_path) as conn:
        rows = conn.execute(
            f"""
            {_SELECT_FIELDS_SQL}
            ORDER BY date DESC, race_number DESC, race_id, horse_name
            """
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def _prepare_start_record(start: Mapping[str, Any]) -> tuple[Any, ...] | None:
    date = _value_from_start(start, "date", "date")
    race_id = _value_from_start(start, "race_id", "raceId")
    race_number = _value_from_start(start, "race_number", "raceNumber")
    horse_name = str(_value_from_start(start, "horse_name", "horseName") or "").strip()
    if not date or not horse_name:
        return None

    normalized_name = str(
        _value_from_start(start, "normalized_horse_name", "normalizedHorseName") or ""
    ).strip()
    if not normalized_name:
        normalized_name = normalize_horse_name(horse_name)

    dedupe_key = build_dedupe_key(date, race_id, race_number, normalized_name)

    return (
        date,
        dedupe_key,
        race_id,
        race_number,
        horse_name,
        normalized_name,
        _value_from_start(start, "first200ms", "first200ms"),
        _value_from_start(start, "last200ms", "last200ms"),
        _value_from_start(start, "best100ms", "best100ms"),
        _value_from_start(start, "actual_km_time", "actualKMTime"),
        _value_from_start(start, "slipstream_distance", "slipstreamDistance"),
    )


def insert_kmtid_starts(
    starts: Iterable[Mapping[str, Any]],
    db_path: str | Path | None = None,
) -> dict[str, int]:
    return save_starts(starts, db_path)


def save_starts(
    starts: Iterable[Mapping[str, Any]],
    db_path: str | Path | None = None,
) -> dict[str, int]:
    init_kmtid_history_store(db_path)

    received = 0
    records: list[tuple[Any, ...]] = []
    for start in starts:
        received += 1
        prepared = _prepare_start_record(start)
        if prepared is not None:
            records.append(prepared)

    if not received:
        return {"inserted": 0, "skipped": 0}

    if not records:
        return {"inserted": 0, "skipped": received}

    with _get_connection(db_path) as conn:
        before = conn.total_changes
        conn.executemany(
            """
            INSERT OR IGNORE INTO kmtid_starts (
                date,
                dedupe_key,
                race_id,
                race_number,
                horse_name,
                normalized_horse_name,
                first200ms,
                last200ms,
                best100ms,
                actual_km_time,
                slipstream_distance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            records,
        )
        inserted = conn.total_changes - before

    total = received
    return {
        "inserted": inserted,
        "skipped": total - inserted,
    }


def get_starts_for_horse(
    normalized_horse_name: str,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    return get_horse_history(normalized_horse_name, db_path)


def get_horse_history(
    normalized_horse_name: str,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    init_kmtid_history_store(db_path)
    key = normalize_horse_name(normalized_horse_name)

    with _get_connection(db_path) as conn:
        rows = conn.execute(
            f"""
            {_SELECT_FIELDS_SQL}
            WHERE normalized_horse_name = ?
            ORDER BY date DESC, race_number DESC, race_id
            """,
            (key,),
        ).fetchall()

    return [row_to_dict(row) for row in rows]


def save_extracted_starts_example(
    extracted_starts: Iterable[Mapping[str, Any]],
    date: str,
    race_id: str,
    race_number: int,
    db_path: str | Path | None = None,
) -> dict[str, int]:
    """
    Minimal example: call this right after parsing one KM-tid race payload.

    Each item in extracted_starts should contain horse-level timing fields from the parser.
    """
    records: list[dict[str, Any]] = []
    for row in extracted_starts:
        horse_name = str(row.get("horseName", "")).strip()
        records.append(
            {
                "date": date,
                "raceId": race_id,
                "raceNumber": race_number,
                "horseName": horse_name,
                "normalizedHorseName": normalize_horse_name(horse_name),
                "first200ms": row.get("first200ms"),
                "last200ms": row.get("last200ms"),
                "best100ms": row.get("best100ms"),
                "actualKMTime": row.get("actualKMTime"),
                "slipstreamDistance": row.get("slipstreamDistance"),
            }
        )

    return save_starts(records, db_path=db_path)
