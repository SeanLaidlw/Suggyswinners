"""
export_data.py - Export racing.db to compact JS for the frontend.
Uses lookup tables to reduce file size by ~75%.

Usage:
    python export_data.py
    python export_data.py --db racing.db --out data.js
"""

import sqlite3, json, argparse
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
            res.finish_position, res.barrier, res.margin_trad,
            res.finish_time, res.odds_sp, res.prize_money,
            h.name AS horse, j.name AS jockey, tr.name AS trainer,
            t.name AS track, m.date, m.going,
            r.race_name, r.race_class, r.distance_m,
            r.race_number
        FROM results res
        JOIN horses h ON h.id = res.horse_id
        LEFT JOIN jockeys j ON j.id = res.jockey_id
        LEFT JOIN trainers tr ON tr.id = res.trainer_id
        JOIN races r ON r.id = res.race_fk
        JOIN meetings m ON m.id = r.meeting_fk
        JOIN tracks t ON t.id = m.track_id
        ORDER BY m.date DESC, r.race_number ASC, res.finish_position ASC
    """).fetchall()

    print(f"  {len(rows)} result rows - building lookup tables...")

    def make_lookup(values):
        unique = sorted(set(v for v in values if v is not None), key=str)
        return unique, {v: i for i, v in enumerate(unique)}

    horses,   hi = make_lookup(r["horse"]     for r in rows)
    jockeys,  ji = make_lookup(r["jockey"]    for r in rows)
    trainers, ti = make_lookup(r["trainer"]   for r in rows)
    tracks,   ki = make_lookup(r["track"]     for r in rows)
    goings,   gi = make_lookup(r["going"]     for r in rows)
    races,    ri = make_lookup(r["race_name"] for r in rows)

    # Columns: [pos, barrier, margin, time, sp, prize, horse, jockey, trainer,
    #           track, date, going, race_name, race_class, distance, race_number]
    encoded = [
        [r["finish_position"], r["barrier"], r["margin_trad"],
         r["finish_time"], r["odds_sp"], r["prize_money"],
         hi.get(r["horse"]), ji.get(r["jockey"]), ti.get(r["trainer"]),
         ki.get(r["track"]), r["date"], gi.get(r["going"]),
         ri.get(r["race_name"]), r["race_class"], r["distance_m"],
         r["race_number"]]
        for r in rows
    ]

    total_meetings = conn.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
    total_races    = conn.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    total_horses   = conn.execute("SELECT COUNT(*) FROM horses").fetchone()[0]
    total_jockeys  = conn.execute("SELECT COUNT(*) FROM jockeys").fetchone()[0]
    total_trainers = conn.execute("SELECT COUNT(*) FROM trainers").fetchone()[0]
    date_range     = conn.execute("SELECT MIN(date), MAX(date) FROM meetings").fetchone()

    summary = {
        "total_results": len(rows), "total_meetings": total_meetings,
        "total_races": total_races, "total_horses": total_horses,
        "total_jockeys": total_jockeys, "total_trainers": total_trainers,
        "date_from": date_range[0], "date_to": date_range[1],
        "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    # Export speed figures - keyed by horse+date+distance for frontend lookup
    speed_figures = {}
    try:
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from speed_map import get_speed_figures
        figs = get_speed_figures(db_path)
        for f in figs:
            # Key: horse|date|distance - matches how frontend looks up a result
            key = f['horse'] + '|' + (f['date'] or '') + '|' + str(f['distance_m'])
            speed_figures[key] = f['figure']
        print(f"  {len(speed_figures)} speed figures calculated")
    except Exception as e:
        print(f"  Speed figures skipped: {e}")

    # Export trial data
    trials_encoded = []
    try:
        trial_rows = conn.execute(
            "SELECT h.name AS horse, j.name AS jockey, t.date, t.track, "
            "t.distance_m, t.finish_position, t.finish_time, t.margin_trad, t.going "
            "FROM trials t JOIN horses h ON h.id=t.horse_id "
            "LEFT JOIN jockeys j ON j.id=t.jockey_id ORDER BY t.date DESC"
        ).fetchall()
        trials_encoded = [dict(r) for r in trial_rows]
        print(f"  {len(trials_encoded)} trial rows")
    except Exception as e:
        print(f"  No trial data yet: {e}")

    conn.close()

    payload = {
        "summary": summary,
        "lookups": {"horse": horses, "jockey": jockeys, "trainer": trainers,
                    "track": tracks, "going": goings, "race_name": races},
        "rows": encoded,
        "trials": trials_encoded,
        "speed_figures": speed_figures,
    }

    js = "window.RACING_DATA = " + json.dumps(payload, default=str, separators=(",", ":")) + ";"
    Path(out_path).write_text(js, encoding="utf-8")

    size_kb = Path(out_path).stat().st_size / 1024
    print(f"  Exported to: {out_path} ({size_kb:.0f} KB)")
    print(f"  Date range:  {summary['date_from']} -> {summary['date_to']}")
    print(f"  Meetings: {total_meetings} | Races: {total_races} | Horses: {total_horses}")
    print(f"\nDone! Upload {out_path} alongside your index.html on GitHub.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db",  default="racing.db")
    parser.add_argument("--out", default="data.js")
    args = parser.parse_args()
    export(args.db, args.out)
