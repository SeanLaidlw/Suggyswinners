"""
Database models for NZ Horse Racing data.
Uses SQLite by default (easy to swap to PostgreSQL later).
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", "racing.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # allows dict-like access
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_connection()
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS tracks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            region      TEXT,
            track_type  TEXT   -- Turf / Synthetic / Jumps
        );

        CREATE TABLE IF NOT EXISTS horses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            colour      TEXT,
            sex         TEXT,
            age         INTEGER,
            sire        TEXT,
            dam         TEXT,
            trainer     TEXT,
            owner       TEXT
        );

        CREATE TABLE IF NOT EXISTS jockeys (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            apprentice  INTEGER DEFAULT 0   -- 1 = yes
        );

        CREATE TABLE IF NOT EXISTS trainers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            location    TEXT
        );

        CREATE TABLE IF NOT EXISTS meetings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id    INTEGER REFERENCES tracks(id),
            date        TEXT NOT NULL,       -- ISO format: YYYY-MM-DD
            weather     TEXT,
            going       TEXT,                -- e.g. Good, Slow, Heavy
            url         TEXT UNIQUE          -- source URL for dedup
        );

        CREATE TABLE IF NOT EXISTS races (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id      INTEGER REFERENCES meetings(id),
            race_number     INTEGER,
            race_name       TEXT,
            race_class      TEXT,            -- e.g. Maiden, Open, Group 1
            distance_m      INTEGER,         -- metres
            prize_money     INTEGER,         -- NZD
            track_condition TEXT,
            start_time      TEXT,
            url             TEXT UNIQUE      -- source URL for dedup
        );

        CREATE TABLE IF NOT EXISTS results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            race_id         INTEGER REFERENCES races(id),
            finish_position INTEGER,
            horse_id        INTEGER REFERENCES horses(id),
            jockey_id       INTEGER REFERENCES jockeys(id),
            trainer_id      INTEGER REFERENCES trainers(id),
            barrier         INTEGER,
            weight_kg       REAL,
            margin          TEXT,            -- e.g. "1.2L", "Nose", "DH"
            finish_time     TEXT,            -- e.g. "1:34.56"
            split_600m      TEXT,
            split_1200m     TEXT,
            odds_sp         REAL,            -- starting price
            gear            TEXT,
            UNIQUE(race_id, finish_position)
        );

        CREATE TABLE IF NOT EXISTS scrape_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            url         TEXT,
            scraped_at  TEXT,
            status      TEXT,               -- success / error
            notes       TEXT
        );
    """)

    conn.commit()
    conn.close()
    print(f"✅ Database initialised at: {DB_PATH}")


def log_scrape(url: str, status: str, notes: str = ""):
    conn = get_connection()
    conn.execute(
        "INSERT INTO scrape_log (url, scraped_at, status, notes) VALUES (?, ?, ?, ?)",
        (url, datetime.utcnow().isoformat(), status, notes)
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
