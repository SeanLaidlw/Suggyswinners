"""
export_data.py — Export racing.db to a JSON file for the frontend.

Reads from racing.db and writes data.js which the dashboard loads directly.
No API server needed — just run this after each scrape.

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

    # --- Results (join everything into flat rows for the frontend) ---
    results = conn.execute("""
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

    results_list = [dict(row) for row in results]
    print(f"  {len(results_list)} result rows")

    # --- Summary stats ---
    total_meetings = conn.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
    total_races    = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    total_horses   = conn.execute("SELECT COUNT(*) FROM horses").fetchone()[0]
    total_jockeys  = conn.execute("SELECT COUNT(*) FROM jockeys").fetchone()[0]
    total_trainers = conn.execute("SELECT COUNT(*) FROM trainers").fetchone()[0]
    date_range     = conn.execute("SELECT MIN(date), MAX(date) FROM meetings").fetchone()

    summary = {
        "total_results":  len(results_list),
        "total_meetings": total_meetings,
        "total_races":    total_races,
        "total_horses":   total_horses,
        "total_jockeys":  total_jockeys,
        "total_trainers": total_trainers,
        "date_from":      date_range[0],
        "date_to":        date_range[1],
        "exported_at":    datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    conn.close()

    # --- Write as a JS file so it loads without a server ---
    # The dashboard will load this with a <script> tag
    payload = {
        "summary": summary,
        "results": results_list,
    }

    js_content = f"window.RACING_DATA = {json.dumps(payload, default=str, separators=(',', ':'))};"

    Path(out_path).write_text(js_content, encoding="utf-8")

    size_kb = Path(out_path).stat().st_size / 1024
    print(f"  Exported to: {out_path} ({size_kb:.0f} KB)")
    print(f"  Date range:  {summary['date_from']} -> {summary['date_to']}")
    print(f"  Meetings: {total_meetings} | Races: {total_races} | Horses: {total_horses}")
    print(f"\nDone! Upload {out_path} alongside your index.html on GitHub.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export racing.db to JSON for the frontend")
    parser.add_argument("--db",  default="racing.db", help="Path to SQLite database")
    parser.add_argument("--out", default="data.js",   help="Output JS file path")
    args = parser.parse_args()
    export(args.db, args.out)
