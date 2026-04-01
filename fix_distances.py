"""
fix_distances.py — Patch NULL/missing distances in the racing database.

Reads all races where distance_m is NULL and tries to extract
the distance from the race name.

Usage:
    python fix_distances.py
    python fix_distances.py --db racing.db --dry-run
"""

import sqlite3
import re
import argparse


NAMED_DISTANCES = {
    "MILE":      1600,
    "MILES":     1600,
    "SPRINT":    1200,
    "TWO MILES": 3200,
    "2 MILES":   3200,
    "6F":        1200,
    "7F":        1400,
    "8F":        1600,
    "10F":       2000,
    "12F":       2400,
}


def extract_distance(race_name: str) -> int | None:
    if not race_name:
        return None

    name_upper = race_name.upper().strip()

    # Named distances first
    for word, metres in NAMED_DISTANCES.items():
        if word in name_upper:
            return metres

    # Pattern: rating/class code then distance with M e.g. "R65 1000M", "MDN 2YO 1000M", "2050M"
    m = re.search(r'\b(?:R\d+|MDN|BM\d+|2YO|3YO)\s+(\d{3,5})M\b', name_upper)
    if m:
        val = int(m.group(1))
        if 800 <= val <= 4000:
            return val

    # Distance with M suffix anywhere e.g. "1200M", "2050M"
    m = re.search(r'\b(\d{3,5})M\b', name_upper)
    if m:
        val = int(m.group(1))
        if 800 <= val <= 4000:
            return val

    # Distance with lowercase m suffix e.g. "1150m"
    m = re.search(r'\b(\d{3,5})m\b', race_name)
    if m:
        val = int(m.group(1))
        if 800 <= val <= 4000:
            return val

    # Bare number anywhere in name e.g. "MAIDEN 1150", "BM65 1400"
    m = re.search(r'\b(\d{3,5})\b', name_upper)
    if m:
        val = int(m.group(1))
        if 800 <= val <= 4000:
            return val

    return None


def fix_distances(db_path: str = "racing.db", dry_run: bool = False):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Find all races with missing distance
    races = conn.execute("""
        SELECT id, race_name, race_number, distance_m
        FROM races
        WHERE distance_m IS NULL OR distance_m = 0
    """).fetchall()

    print(f"Found {len(races)} races with missing distance")

    fixed = 0
    still_missing = 0

    for race in races:
        dist = extract_distance(race["race_name"])

        if dist:
            if not dry_run:
                conn.execute(
                    "UPDATE races SET distance_m = ? WHERE id = ?",
                    (dist, race["id"])
                )
            print(f"  OK Race {race['id']:5}: '{race['race_name']}' → {dist}m")
            fixed += 1
        else:
            print(f"  XX Race {race['id']:5}: '{race['race_name']}' — could not extract distance")
            still_missing += 1

    if not dry_run:
        conn.commit()
        print(f"\nOK Fixed {fixed} races")
    else:
        print(f"\n[DRY RUN] Would fix {fixed} races")

    if still_missing:
        print(f"WARNING  {still_missing} races still have no distance — check race names above")

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fix missing distances in racing.db")
    parser.add_argument("--db", default="racing.db", help="Database path")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()
    fix_distances(args.db, args.dry_run)
