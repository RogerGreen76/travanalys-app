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
    race_id TEXT NOT NULL,
    race_number INTEGER,
    horse_name TEXT NOT NULL,
    normalized_horse_name TEXT NOT NULL,
    first200ms REAL,
    last200ms REAL,
    best100ms REAL,
    actual_km_time REAL,
    slipstream_distance REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(date, race_id, race_number, normalized_horse_name)
);

CREATE INDEX IF NOT EXISTS idx_kmtid_starts_normalized_horse_name
    ON kmtid_starts(normalized_horse_name);

CREATE INDEX IF NOT EXISTS idx_kmtid_starts_date
    ON kmtid_starts(date);
"""


def _resolve_db_path(db_path: str | Path | None = None) -> Path:
    return Path(db_path) if db_path is not None else DEFAULT_DB_PATH


def _get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = _resolve_db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def normalize_horse_name(horse_name: str) -> str:
    # Lowercase and collapse whitespace so lookups remain stable.
    compact = re.sub(r"\s+", " ", (horse_name or "").strip())
    return compact.casefold()


def init_kmtid_history_store(db_path: str | Path | None = None) -> None:
    with _get_connection(db_path) as conn:
        conn.executescript(SCHEMA_SQL)


def load_kmtid_history(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    init_kmtid_history_store(db_path)
    with _get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT
                date,
                race_id AS raceId,
                race_number AS raceNumber,
                horse_name AS horseName,
                normalized_horse_name AS normalizedHorseName,
                first200ms,
                last200ms,
                best100ms,
                actual_km_time AS actualKMTime,
                slipstream_distance AS slipstreamDistance
            FROM kmtid_starts
            ORDER BY date DESC, race_id, race_number, horse_name
            """
        ).fetchall()
    return [dict(row) for row in rows]


def insert_kmtid_starts(
    starts: Iterable[Mapping[str, Any]],
    db_path: str | Path | None = None,
) -> dict[str, int]:
    init_kmtid_history_store(db_path)

    records: list[tuple[Any, ...]] = []
    for start in starts:
        horse_name = str(start.get("horseName", "")).strip()
        normalized_name = str(start.get("normalizedHorseName") or "").strip()
        if not normalized_name:
            normalized_name = normalize_horse_name(horse_name)

        records.append(
            (
                start.get("date"),
                start.get("raceId"),
                start.get("raceNumber"),
                horse_name,
                normalized_name,
                start.get("first200ms"),
                start.get("last200ms"),
                start.get("best100ms"),
                start.get("actualKMTime"),
                start.get("slipstreamDistance"),
            )
        )

    if not records:
        return {"inserted": 0, "duplicates": 0, "received": 0}

    with _get_connection(db_path) as conn:
        before = conn.total_changes
        conn.executemany(
            """
            INSERT OR IGNORE INTO kmtid_starts (
                date,
                race_id,
                race_number,
                horse_name,
                normalized_horse_name,
                first200ms,
                last200ms,
                best100ms,
                actual_km_time,
                slipstream_distance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            records,
        )
        inserted = conn.total_changes - before

    received = len(records)
    return {
        "inserted": inserted,
        "duplicates": received - inserted,
        "received": received,
    }


def get_starts_for_horse(
    normalized_horse_name: str,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    init_kmtid_history_store(db_path)
    key = normalize_horse_name(normalized_horse_name)

    with _get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT
                date,
                race_id AS raceId,
                race_number AS raceNumber,
                horse_name AS horseName,
                normalized_horse_name AS normalizedHorseName,
                first200ms,
                last200ms,
                best100ms,
                actual_km_time AS actualKMTime,
                slipstream_distance AS slipstreamDistance
            FROM kmtid_starts
            WHERE normalized_horse_name = ?
            ORDER BY date DESC, race_id, race_number
            """,
            (key,),
        ).fetchall()

    return [dict(row) for row in rows]


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
    records = []
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

    return insert_kmtid_starts(records, db_path=db_path)
