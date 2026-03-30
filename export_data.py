"""
export_data.py — Export racing.db to an optimised JS file for the frontend.

Uses lookup tables for repeated strings (horse names, tracks etc) so
"Auckland Thoroughbred Racing" is stored once as ID 42, not repeated 500 times.
This reduces file size by ~60% compared to naive JSON export.

Usage:
    python export_data.py
    python export_data.py --db racing.db --out data.js
"""

import sqlite3
import json
import argparse
from datetime import datetime
from pathlib import Path


def get_conn(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def export(db_path="racing.db", out_path="data.js"):
    print(f"Reading from: {db_path}")
    conn = get_conn(db_path)

    rows = conn.execute("""
        SELECT
            res.finish_position,
            res.barrier,
            res.margin_trad,
            res.finish_time,
            res.odds_sp,
            res.prize_money,
            h.name  AS horse,
            j.name  AS jockey,
            tr.name AS trainer,
            t.name  AS track,
            m.date,
            m.going,
            r.race_name,
            r.race_class,
            r.distance_m
        FROM results res
        JOIN horses   h  ON h.id  = res.horse_id
        LEFT JOIN jockeys  j  ON j.id  = res.jockey_id
        LEFT JOIN trainers tr ON tr.id = res.trainer_id
        JOIN races    r  ON r.id  = res.race_fk
        JOIN meetings m  ON m.id  = r.meeting_fk
        JOIN tracks   t  ON t.id  = m.track_id
        ORDER BY m.date DESC, r.race_number ASC, res.finish_position ASC
    """).fetchall()

    print(f"  {len(rows)} result rows - building lookup tables...")

    def make_lookup(values):
        unique = sorted(set(v for v in values if v is not None), key=str)
        index = {v: i for i, v in enumerate(unique)}
        return unique, index

    horses_list,   horses_idx   = make_lookup(r["horse"]     for r in rows)
    jockeys_list,  jockeys_idx  = make_lookup(r["jockey"]    for r in rows)
    trainers_list, trainers_idx = make_lookup(r["trainer"]   for r in rows)
    tracks_list,   tracks_idx   = make_lookup(r["track"]     for r in rows)
    goings_list,   goings_idx   = make_lookup(r["going"]     for r in rows)
    races_list,    races_idx    = make_lookup(r["race_name"] for r in rows)

    encoded_rows = []
    for r in rows:
        encoded_rows.append([
            r["finish_position"],
            r["barrier"],
            r["margin_trad"],
            r["finish_time"],
            r["odds_sp"],
            r["prize_money"],
            horses_idx.get(r["horse"]),
            jockeys_idx.get(r["jockey"]),
            trainers_idx.get(r["trainer"]),
            tracks_idx.get(r["track"]),
            r["date"],
            goings_idx.get(r["going"]),
            races_idx.get(r["race_name"]),
            r["race_class"],
            r["distance_m"],
        ])

    total_meetings = conn.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
    total_races    = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    total_horses   = conn.execute("SELECT COUNT(*) FROM horses").fetchone()[0]
    total_jockeys  = conn.execute("SELECT COUNT(*) FROM jockeys").fetchone()[0]
    total_trainers = conn.execute("SELECT COUNT(*) FROM trainers").fetchone()[0]
    date_range     = conn.execute("SELECT MIN(date), MAX(date) FROM meetings").fetchone()
    conn.close()

    summary = {
        "total_results":  len(rows),
        "total_meetings": total_meetings,
        "total_races":    total_races,
        "total_horses":   total_horses,
        "total_jockeys":  total_jockeys,
        "total_trainers": total_trainers,
        "date_from":      date_range[0],
        "date_to":        date_range[1],
        "exported_at":    datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    columns = ["finish_position","barrier","margin_trad","finish_time",
               "odds_sp","prize_money","horse","jockey","trainer","track",
               "date","going","race_name","race_class","distance_m"]

    payload = {
        "summary":  summary,
        "columns":  columns,
        "lookups": {
            "horse":     horses_list,
            "jockey":    jockeys_list,
            "trainer":   trainers_list,
            "track":     tracks_list,
            "going":     goings_list,
            "race_name": races_list,
        },
        "rows": encoded_rows,
    }

    js_content = (
        "window.RACING_DATA = "
        + json.dumps(payload, default=str, separators=(',', ':'))
        + ";"
    )

    Path(out_path).write_text(js_content, encoding="utf-8")

    size_kb = Path(out_path).stat().st_size / 1024
    print(f"  Exported to: {out_path} ({size_kb:.0f} KB)")
    print(f"  Date range:  {summary['date_from']} -> {summary['date_to']}")
    print(f"  Meetings: {total_meetings} | Races: {total_races} | Horses: {total_horses}")
    print(f"  Lookup tables: {len(horses_list)} horses, {len(jockeys_list)} jockeys, {len(trainers_list)} trainers")
    print(f"\nDone! Upload {out_path} alongside your index.html on GitHub.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export racing.db to optimised JS")
    parser.add_argument("--db",  default="racing.db", help="Path to SQLite database")
    parser.add_argument("--out", default="data.js",   help="Output JS file path")
    args = parser.parse_args()
    export(args.db, args.out)
