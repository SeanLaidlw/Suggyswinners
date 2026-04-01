"""
fix_positions.py - Fix finish positions over 30 in the database.
Run from your project folder: python3 fix_positions.py
"""
import sqlite3

conn = sqlite3.connect("racing.db")

bad = conn.execute("SELECT COUNT(*) FROM results WHERE finish_position > 30").fetchone()[0]
print(f"Records with finish_position > 30: {bad}")

if bad == 0:
    print("All clean!")
    conn.close()
    exit()

races = conn.execute(
    "SELECT DISTINCT race_fk FROM results WHERE finish_position > 30"
).fetchall()
print(f"Races affected: {len(races)}")

fixed = 0
for (race_fk,) in races:
    last_placed = conn.execute("""
        SELECT MAX(finish_position) FROM results
        WHERE race_fk=? AND finish_position <= 30
    """, (race_fk,)).fetchone()[0] or 0

    bad_records = conn.execute("""
        SELECT id FROM results
        WHERE race_fk=? AND finish_position > 30
        ORDER BY finish_position ASC
    """, (race_fk,)).fetchall()

    for idx, (rid,) in enumerate(bad_records):
        new_pos = last_placed + 1 + idx
        try:
            conn.execute("UPDATE results SET finish_position=? WHERE id=?", (new_pos, rid))
            fixed += 1
        except sqlite3.IntegrityError:
            conn.execute("DELETE FROM results WHERE id=?", (rid,))
            fixed += 1

conn.commit()

remaining = conn.execute(
    "SELECT COUNT(*) FROM results WHERE finish_position > 30"
).fetchone()[0]
print(f"Fixed {fixed} records. Remaining bad: {remaining}")
conn.close()

print("\nNow run: python3 export_data.py && git add data.js && git commit -m 'Fix positions' && git push origin main")
