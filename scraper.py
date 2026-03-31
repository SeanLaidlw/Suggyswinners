"""
Scraper for loveracing.nz race results.

URL structure (discovered from live site):
  Home page:       https://loveracing.nz/Home.aspx
  Meeting page:    https://loveracing.nz/RaceInfo/{meetingID}/Meeting-Overview.aspx
  Race detail:     https://loveracing.nz/RaceInfo/{meetingID}/{raceNum}/Race-Detail.aspx

Usage:
    python scraper.py
"""

import re
import sys
import time
import random
import sqlite3
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("Playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

BASE_URL = "https://loveracing.nz"
HOME_URL = f"{BASE_URL}/Home.aspx"
DB_PATH = "racing.db"

MIN_DELAY = 2.0
MAX_DELAY = 4.0


# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tracks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS horses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS jockeys (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS trainers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS meetings (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id      TEXT NOT NULL UNIQUE,
            track_id        INTEGER REFERENCES tracks(id),
            date            TEXT,
            weather         TEXT,
            going           TEXT,
            rail            TEXT
        );
        CREATE TABLE IF NOT EXISTS races (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_fk      INTEGER REFERENCES meetings(id),
            race_number     INTEGER,
            race_name       TEXT,
            distance_m      INTEGER,
            race_class      TEXT,
            prize_money     INTEGER,
            start_time      TEXT,
            UNIQUE(meeting_fk, race_number)
        );
        CREATE TABLE IF NOT EXISTS trials (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id      TEXT NOT NULL,
            track           TEXT,
            date            TEXT,
            distance_m      INTEGER,
            finish_position INTEGER,
            horse_id        INTEGER REFERENCES horses(id),
            jockey_id       INTEGER REFERENCES jockeys(id),
            finish_time     TEXT,
            margin_trad     TEXT,
            going           TEXT,
            UNIQUE(meeting_id, distance_m, finish_position, horse_id)
        );
        CREATE TABLE IF NOT EXISTS results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            race_fk         INTEGER REFERENCES races(id),
            finish_position INTEGER,
            horse_id        INTEGER REFERENCES horses(id),
            jockey_id       INTEGER REFERENCES jockeys(id),
            trainer_id      INTEGER REFERENCES trainers(id),
            barrier         INTEGER,
            weight_kg       REAL,
            weight_carried  REAL,
            margin_dec      TEXT,
            margin_trad     TEXT,
            finish_time     TEXT,
            last_600        TEXT,
            odds_sp         REAL,
            prize_money     INTEGER,
            UNIQUE(race_fk, finish_position)
        );
        CREATE TABLE IF NOT EXISTS scrape_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            url         TEXT,
            scraped_at  TEXT,
            status      TEXT,
            notes       TEXT
        );
    """)
    conn.commit()
    print("Database ready.")


def upsert(conn, table, name):
    conn.execute(f"INSERT OR IGNORE INTO {table} (name) VALUES (?)", (name,))
    return conn.execute(f"SELECT id FROM {table} WHERE name = ?", (name,)).fetchone()["id"]


def log_scrape(conn, url, status, notes=""):
    conn.execute(
        "INSERT INTO scrape_log (url, scraped_at, status, notes) VALUES (?, ?, ?, ?)",
        (url, datetime.utcnow().isoformat(), status, notes)
    )
    conn.commit()


def delay():
    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


def clean(text):
    return " ".join(text.strip().split()) if text else ""


# ---------------------------------------------------------------------------
# Step 1: Get meeting IDs from home page
# ---------------------------------------------------------------------------

def get_meeting_ids_from_home(page):
    print(f"Loading home page: {HOME_URL}")
    try:
        page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30000)
    except PWTimeout:
        print("  Timeout on home page")
        return []

    delay()

    links = page.query_selector_all("a[href*='Meeting-Overview.aspx']")
    meeting_ids = []
    seen = set()

    for link in links:
        href = link.get_attribute("href") or ""
        m = re.search(r"/RaceInfo/(\d+)/Meeting-Overview", href)
        if m:
            mid = m.group(1)
            if mid not in seen:
                seen.add(mid)
                track_name = clean(link.inner_text())
                meeting_ids.append({"id": mid, "track": track_name})

    print(f"  Found {len(meeting_ids)} meetings on home page")
    return meeting_ids


# ---------------------------------------------------------------------------
# Step 2: Scrape a meeting overview page
# ---------------------------------------------------------------------------

def scrape_meeting(page, meeting_info, conn):
    mid = meeting_info["id"]
    url = f"{BASE_URL}/RaceInfo/{mid}/Meeting-Overview.aspx"

    existing = conn.execute("SELECT id FROM meetings WHERE meeting_id = ?", (mid,)).fetchone()
    if existing:
        print(f"  Already scraped meeting {mid}, skipping.")
        return

    print(f"\nMeeting {mid}: {meeting_info.get('track', '')} — {url}")

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except PWTimeout:
        print(f"  Timeout loading meeting {mid}")
        log_scrape(conn, url, "error", "timeout")
        return

    delay()

    body = page.query_selector("body")
    body_text = clean(body.inner_text()) if body else ""

    # Parse meeting date e.g. "Saturday, 28 Mar 2026"
    meeting_date = None
    date_match = re.search(
        r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2}\s+\w+\s+\d{4})",
        body_text
    )
    if date_match:
        try:
            meeting_date = datetime.strptime(date_match.group(1), "%d %b %Y").strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Going e.g. "Heavy10"
    going = None
    going_match = re.search(r"GOING\s+([A-Za-z]+\d*)", body_text)
    if going_match:
        going = going_match.group(1)

    # Weather
    weather = None
    weather_match = re.search(r"WEATHER\s+(\w+)", body_text)
    if weather_match:
        weather = weather_match.group(1)

    # Rail
    rail = None
    rail_match = re.search(r"RAIL\s+(.+?)(?:TRACK|STRAIGHT|$)", body_text)
    if rail_match:
        rail = rail_match.group(1).strip()[:200]

    track_name = meeting_info.get("track", "Unknown")
    track_id = upsert(conn, "tracks", track_name)

    conn.execute(
        "INSERT OR IGNORE INTO meetings (meeting_id, track_id, date, weather, going, rail) VALUES (?, ?, ?, ?, ?, ?)",
        (mid, track_id, meeting_date, weather, going, rail)
    )
    conn.commit()

    meeting_fk = conn.execute("SELECT id FROM meetings WHERE meeting_id = ?", (mid,)).fetchone()["id"]

    print(f"  Date: {meeting_date} | Going: {going} | Weather: {weather}")

    # Detect trial days - title or body contains "TRIAL"
    is_trial = 'TRIAL' in body_text.upper()[:500]
    if is_trial:
        print(f"  -> Trial day detected (ID:{mid})")
        # Check if already scraped as trial
        existing_trial = conn.execute(
            "SELECT COUNT(*) FROM trials WHERE meeting_id=?", (mid,)
        ).fetchone()[0]
        if existing_trial > 0:
            print(f"  Already have {existing_trial} trial results for {mid}, skipping.")
            return

    # Find race links on the meeting page
    race_numbers = []
    race_links = page.query_selector_all("a[href*='Race-Detail.aspx']")
    for link in race_links:
        href = link.get_attribute("href") or ""
        m = re.search(rf"/RaceInfo/{mid}/(\d+)/Race-Detail", href)
        if m:
            rnum = int(m.group(1))
            if rnum not in race_numbers:
                race_numbers.append(rnum)

    # If no links found, try races 1-10 and stop on 404
    if not race_numbers:
        race_numbers = list(range(1, 11))

    print(f"  Scraping races: {sorted(race_numbers)}")

    races_scraped = 0
    for rnum in sorted(race_numbers):
        if is_trial:
            ok = scrape_trial_race(page, mid, rnum, meeting_date, track_name, going, conn)
        else:
            ok = scrape_race(page, mid, rnum, meeting_fk, conn)
        if ok:
            races_scraped += 1
        elif not race_links:
            break
        delay()

    kind = "trials" if is_trial else "races"
    log_scrape(conn, url, "success", f"{races_scraped} {kind}")
    print(f"  Done — {races_scraped} {kind} saved.")


# ---------------------------------------------------------------------------
# Step 3: Scrape individual race detail page
# ---------------------------------------------------------------------------

def scrape_trial_race(page, meeting_id, race_num, date, track, going, conn):
    """Scrape a single trial race and store in trials table."""
    url = f"{BASE_URL}/RaceInfo/{meeting_id}/{race_num}/Race-Detail.aspx"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except PWTimeout:
        return False

    delay()
    body = page.query_selector("body")
    if not body:
        return False

    body_text = clean(body.inner_text())
    lines = [l.strip() for l in body_text.split("\n") if l.strip()]

    # Parse distance from race name line e.g. "TRIAL 1200M" or "1200"
    distance_m = None
    for line in lines[:20]:
        m = re.search(r"(\d{3,4})\s*M", line.upper())
        if m:
            distance_m = int(m.group(1))
            break

    # Find placed runners section
    # Trial results follow same format as race results
    plc_idx = next((i for i, l in enumerate(lines)
                    if re.match(r"^PL(ACED)?\b|^RESULT", l.upper())), None)

    if plc_idx is None:
        plc_idx = 0

    overview_idx = len(lines)
    for kw in ["OVERVIEW", "BACK TO MEETING", "RACE DETAIL"]:
        ki = next((i for i, l in enumerate(lines) if kw in l.upper() and i > plc_idx + 5), None)
        if ki:
            overview_idx = min(overview_idx, ki)

    # Parse runners in groups: pos, saddle, horse, jockey (trial has no prize)
    stored = 0
    i = plc_idx
    position = 0
    margin = None

    while i < min(plc_idx + 100, overview_idx):
        line = lines[i]
        # Finish position - single or double digit
        if re.match(r"^\d{1,2}$", line) and 1 <= int(line) <= 20:
            position = int(line)
            if i + 3 < overview_idx:
                saddle_line = lines[i+1]
                horse_name  = lines[i+2]
                jockey_name = lines[i+3]
                # Validate - horse name shouldn't be all digits
                if re.match(r"^\d+$", horse_name):
                    i += 1
                    continue
                horse_id  = upsert(conn, "horses",  horse_name)
                jockey_id = upsert(conn, "jockeys", jockey_name) if jockey_name else None

                # Try to get finish time from stats block (appears later)
                finish_time = None
                for j in range(i+4, min(i+15, overview_idx)):
                    if re.match(r"^\d+\.\d+\.\d+$", lines[j]):
                        finish_time = lines[j]
                        break

                try:
                    conn.execute("""
                        INSERT OR IGNORE INTO trials
                        (meeting_id, track, date, distance_m, finish_position,
                         horse_id, jockey_id, finish_time, margin_trad, going)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (str(meeting_id), track, date, distance_m, position,
                          horse_id, jockey_id, finish_time, margin, going))
                    stored += 1
                except Exception:
                    pass
                i += 4
                continue
        i += 1

    conn.commit()
    if stored > 0:
        print(f"    Trial race {race_num}: {stored} runners, {distance_m}m")
    return stored > 0


def scrape_race(page, meeting_id, race_num, meeting_fk, conn):
    url = f"{BASE_URL}/RaceInfo/{meeting_id}/{race_num}/Race-Detail.aspx"

    existing = conn.execute(
        "SELECT id FROM races WHERE meeting_fk = ? AND race_number = ?",
        (meeting_fk, race_num)
    ).fetchone()
    if existing:
        return False

    print(f"    Race {race_num}: {url}")

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except PWTimeout:
        print(f"      Timeout on race {race_num}")
        return False

    body = page.query_selector("body")
    if not body:
        return False

    raw_lines = [l.strip() for l in body.inner_text().split("\n") if l.strip()]
    text = " ".join(raw_lines)  # flat string for regex only

    if "Page Not Found" in text or len(text) < 200:
        return False

    # --- Race header ---
    race_name = ""
    race_class = ""
    distance_m = None
    prize_money = None
    start_time = None

    for line in raw_lines:
        m = re.match(rf"Race {race_num}:\s*(.+)", line)
        if m:
            race_name = clean(m.group(1))
            break

    # e.g. "MDN 1150m - $25,000"
    detail_match = re.search(
        r"(MDN|Open|BM\d+|Gr\.\d|Group\s*\d|Listed|2YO|3YO|4YO\+?)\s+(\d+)m\s*-\s*\$([\d,]+)",
        text
    )
    if detail_match:
        race_class = detail_match.group(1)
        distance_m = int(detail_match.group(2))
        prize_money = int(detail_match.group(3).replace(",", ""))

    # Also try to extract prize money separately
    if prize_money is None:
        prize_match = re.search(r"\$\s*([\d,]+)", text)
        if prize_match:
            val = int(prize_match.group(1).replace(",", ""))
            if val >= 1000:
                prize_money = val

    # Extract distance from race name — handles all patterns
    if distance_m is None and race_name:
        name_upper = race_name.upper()
        NAMED_DIST = {"MILE":1600,"MILES":1600,"SPRINT":1200,"TWO MILES":3200,"2 MILES":3200}
        for word, metres in NAMED_DIST.items():
            if word in name_upper:
                distance_m = metres
                break

    if distance_m is None and race_name:
        name_upper = race_name.upper()
        # R65 1000M, MDN 2YO 1000M style
        m = re.search(r"\b(?:R\d+|MDN|BM\d+|2YO|3YO)\s+(\d{3,5})M\b", name_upper)
        if m:
            val = int(m.group(1))
            if 800 <= val <= 4000:
                distance_m = val

    if distance_m is None and race_name:
        name_upper = race_name.upper()
        # Bare \d{3,5}M e.g. "2050M", "1200M"
        m = re.search(r"\b(\d{3,5})M\b", name_upper)
        if m:
            val = int(m.group(1))
            if 800 <= val <= 4000:
                distance_m = val

    if distance_m is None and race_name:
        # lowercase m suffix e.g. "1150m"
        m = re.search(r"\b(\d{3,5})m\b", race_name)
        if m:
            val = int(m.group(1))
            if 800 <= val <= 4000:
                distance_m = val

    if distance_m is None and race_name:
        # Bare number e.g. "MAIDEN 1150"
        m = re.search(r"\b(\d{3,5})\b", race_name)
        if m:
            val = int(m.group(1))
            if 800 <= val <= 4000:
                distance_m = val

    if distance_m is None:
        # Last resort: scan page text for Xm pattern
        page_dist = re.search(r"\b(\d{3,5})m\b", text)
        if page_dist:
            val = int(page_dist.group(1))
            if 800 <= val <= 4000:
                distance_m = val

    time_match = re.search(r"(\d{1,2}:\d{2}\s*[ap]m)", text, re.I)
    if time_match:
        start_time = time_match.group(1)

    race_id = conn.execute(
        """INSERT OR IGNORE INTO races
           (meeting_fk, race_number, race_name, distance_m, race_class, prize_money, start_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (meeting_fk, race_num, race_name, distance_m, race_class, prize_money, start_time)
    ).lastrowid

    if not race_id:
        race_id = conn.execute(
            "SELECT id FROM races WHERE meeting_fk = ? AND race_number = ?",
            (meeting_fk, race_num)
        ).fetchone()["id"]

    rows_saved = parse_results(raw_lines, race_id, conn)
    conn.commit()

    print(f"      {race_name} — {distance_m}m — {rows_saved} runners saved")
    return True


# ---------------------------------------------------------------------------
# Parse results from race page
# ---------------------------------------------------------------------------

def parse_results(lines, race_id, conn):
    """
    Parse the two-part results table from the race detail page.

    Part 1 (lines after "Plc # Stake" header):
        pos, saddle, horse, jockey, prize  (5 lines, placed runners)
        saddle, horse, jockey              (3 lines, unplaced runners — no pos/prize)

    Part 2 (lines after "Bar SP Weight Car Dec Trad Time Last600 Trainer" header):
        barrier, sp, weight, carried, [margin_dec, margin_trad,] time, last600, trainer
        (winner has no margins — only 7 fields; others have 9)
    """
    rows_saved = 0

    # --- Find section boundaries ---
    plc_idx = None       # line index of "Plc"
    overview_idx = None  # line index of "OVERVIEW"
    bar_idx = None       # line index of "Bar" header

    for i, line in enumerate(lines):
        if line == "Plc" and plc_idx is None:
            plc_idx = i
        if line == "OVERVIEW" and overview_idx is None:
            overview_idx = i
        if line == "Bar" and bar_idx is None and overview_idx is not None:
            bar_idx = i

    if plc_idx is None or overview_idx is None:
        print("      Could not find results section markers")
        return 0

    # --- Part 1: parse placed and unplaced runners ---
    # Placed: lines[plc_idx+3 ...] in groups of 5: pos, saddle, horse, jockey, prize
    # Unplaced: after placed runners, groups of 3: saddle, horse, jockey (no pos, no prize)

    runners = {}   # finish_position -> dict (placed runners)
    unplaced = []  # list of dicts (unplaced runners, pos = None)

    i = plc_idx + 3  # skip "Plc", "#", "Stake" headers
    in_unplaced = False

    while i < overview_idx:
        line = lines[i]

        if not in_unplaced:
            # Placed runner: starts with finish position (1-20)
            if re.match(r"^\d{1,2}$", line) and 1 <= int(line) <= 20:
                pos = int(line)
                if i + 4 < overview_idx and re.match(r"^\d{1,2}$", lines[i+1]):
                    saddle = int(lines[i+1])
                    horse  = lines[i+2]
                    jockey = lines[i+3]
                    prize  = None
                    if lines[i+4].startswith("$"):
                        try:
                            prize = int(lines[i+4].replace("$","").replace(",",""))
                        except ValueError:
                            pass
                    runners[pos] = {"position": pos, "saddle": saddle,
                                    "horse": horse, "jockey": jockey, "prize": prize}
                    i += 5
                    continue
                else:
                    # Looks like unplaced section started
                    in_unplaced = True

            # Detect start of unplaced section:
            # A saddle number followed by a horse name (no prize after jockey)
            elif re.match(r"^\d{1,2}$", line):
                in_unplaced = True

        if in_unplaced:
            # Unplaced: saddle, horse, jockey (3 lines)
            if re.match(r"^\d{1,2}$", line) and i + 2 < overview_idx:
                saddle = int(line)
                horse  = lines[i+1]
                jockey = lines[i+2]
                # Make sure horse doesn't look like a keyword
                if horse and not re.match(r"^\d+$", horse):
                    unplaced.append({"position": None, "saddle": saddle,
                                     "horse": horse, "jockey": jockey, "prize": None})
                i += 3
                continue

        i += 1

    # --- Part 2: parse barrier/SP/weight/margins/time/last600/trainer ---
    # Header is: Bar, SP, Weight, Car, Dec, Trad, Time, Last 600, Trainer
    # Skip those header lines, then parse each runner block

    second_rows = []

    if bar_idx is None:
        # Find it manually — 9 header words after OVERVIEW
        for i, line in enumerate(lines):
            if line == "Bar" and i > (overview_idx or 0):
                bar_idx = i
                break

    if bar_idx is not None:
        # Skip header lines: Bar SP Weight Car Dec Trad Time Last 600 Trainer = 9 lines
        i = bar_idx + 9
        stop = len(lines)

        while i < stop:
            line = lines[i]

            # Stop at footer content
            if line in ["Join In", "Race Meeting Calendar", "DIVIDENDS"]:
                break

            # Each block starts with a barrier number
            if re.match(r"^\d{1,2}$", line) and 1 <= int(line) <= 24:
                block = {"barrier": int(line)}
                j = i + 1

                # SP e.g. $8.10
                if j < stop and re.match(r"^\$[\d.]+$", lines[j]):
                    try:
                        block["sp"] = float(lines[j].replace("$", ""))
                    except ValueError:
                        pass
                    j += 1

                # Weight (declared) e.g. 58.0
                if j < stop and re.match(r"^\d{2,3}\.\d$", lines[j]):
                    try:
                        block["weight"] = float(lines[j])
                    except ValueError:
                        pass
                    j += 1

                # Weight carried e.g. 55.0
                if j < stop and re.match(r"^\d{2,3}\.\d$", lines[j]):
                    try:
                        block["carried"] = float(lines[j])
                    except ValueError:
                        pass
                    j += 1

                # Decimal margin e.g. "1.45L" — winner won't have this
                if j < stop and re.search(r"[\d.]+L$", lines[j]):
                    block["margin_dec"] = lines[j]
                    j += 1

                    # Traditional margin e.g. "1 1/2 LEN", "NOSE", "HEAD"
                    if j < stop and re.search(r"LEN|NOSE|NECK|HEAD|\bSH\b|\bDH\b", lines[j], re.I):
                        block["margin_trad"] = lines[j]
                        j += 1

                # Finish time e.g. 1.09.10
                if j < stop and re.match(r"^\d+\.\d+\.\d+$", lines[j]):
                    block["time"] = lines[j]
                    j += 1

                # Last 600 e.g. 0.36.06
                if j < stop and re.match(r"^\d+\.\d+\.\d+$", lines[j]):
                    block["last600"] = lines[j]
                    j += 1

                # Trainer — non-numeric, non-keyword string
                if j < stop and not re.match(r"^\d", lines[j]) and lines[j] not in [
                    "Join In", "DIVIDENDS", "VIDEO", "Race Meeting Calendar"
                ]:
                    block["trainer"] = lines[j]
                    j += 1

                second_rows.append(block)
                i = j
                continue

            # Unplaced runners in part 2 have only weight + trainer (no barrier/SP)
            # e.g. lines 196-205 in the sample: "58.0\nBruce Wallace..."
            elif re.match(r"^\d{2,3}\.\d$", line):
                block = {"weight": float(line)}
                j = i + 1
                if j < stop and not re.match(r"^\d", lines[j]) and lines[j] not in [
                    "Join In", "DIVIDENDS", "VIDEO", "Race Meeting Calendar"
                ]:
                    block["trainer"] = lines[j]
                    j += 1
                second_rows.append(block)
                i = j
                continue

            i += 1

    # --- Merge part 1 + part 2 and save ---
    # second_rows are in finishing order matching placed then unplaced

    all_runners = [runners[p] for p in sorted(runners.keys())] + unplaced

    for idx, runner in enumerate(all_runners):
        extra = second_rows[idx] if idx < len(second_rows) else {}

        horse_name  = runner.get("horse", "")
        jockey_name = runner.get("jockey", "")
        trainer_name = extra.get("trainer", "")

        if not horse_name or re.match(r"^\d+$", horse_name):
            continue

        horse_id   = upsert(conn, "horses", horse_name)
        jockey_id  = upsert(conn, "jockeys", jockey_name) if jockey_name else None
        trainer_id = upsert(conn, "trainers", trainer_name) if trainer_name else None

        finish_pos = runner["position"] if runner["position"] is not None else 99 + idx

        try:
            conn.execute(
                """INSERT OR IGNORE INTO results
                   (race_fk, finish_position, horse_id, jockey_id, trainer_id,
                    barrier, weight_kg, weight_carried, margin_dec, margin_trad,
                    finish_time, last_600, odds_sp, prize_money)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    race_id, finish_pos,
                    horse_id, jockey_id, trainer_id,
                    extra.get("barrier"),
                    extra.get("weight"),
                    extra.get("carried"),
                    extra.get("margin_dec"),
                    extra.get("margin_trad"),
                    extra.get("time"),
                    extra.get("last600"),
                    extra.get("sp"),
                    runner.get("prize"),
                )
            )
            rows_saved += 1
        except Exception as e:
            print(f"      Error saving {horse_name}: {e}")

    return rows_saved


# ---------------------------------------------------------------------------
# Backfill: discover past meeting IDs from the Results listing page
# ---------------------------------------------------------------------------

RACEINFO_URL = f"{BASE_URL}/RaceInfo.aspx"

def get_all_meeting_ids_from_results_page(page):
    """
    Scrape RaceInfo.aspx which lists recent past meetings.
    Returns deduplicated list of {id, track} dicts.
    """
    print(f"Loading results listing: {RACEINFO_URL}")
    try:
        page.goto(RACEINFO_URL, wait_until="domcontentloaded", timeout=30000)
    except PWTimeout:
        print("  Timeout on results page")
        return []

    delay()

    links = page.query_selector_all("a[href*='Meeting-Overview.aspx']")
    meeting_ids = []
    seen = set()

    for link in links:
        href = link.get_attribute("href") or ""
        m = re.search(r"/RaceInfo/(\d+)/Meeting-Overview", href)
        if m:
            mid = m.group(1)
            if mid not in seen:
                seen.add(mid)
                track_name = clean(link.inner_text())
                meeting_ids.append({"id": mid, "track": track_name})

    print(f"  Found {len(meeting_ids)} meetings on results page")
    return meeting_ids


def probe_meeting_id(page, mid):
    """
    Check if a meeting ID is valid by loading its overview page.
    Returns {id, track} if valid, None if not found.
    """
    url = f"{BASE_URL}/RaceInfo/{mid}/Meeting-Overview.aspx"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
    except PWTimeout:
        return None

    body = page.query_selector("body")
    if not body:
        return None

    text = body.inner_text()

    # If page not found or no race content, skip
    if "Page Not Found" in text or "404" in text:
        return None

    # Try to get track name from page
    track = ""
    for line in text.split("\n"):
        line = line.strip()
        if "@" in line and len(line) < 80:
            track = line
            break

    # Must have some race-like content
    if "Race" not in text and "GOING" not in text:
        return None

    return {"id": str(mid), "track": track}


def backfill(months=3):
    """
    Backfill historical meetings by:
    1. Getting all IDs visible on the results listing page
    2. Finding the lowest ID on that page
    3. Probing backwards from there to find older meetings
    """
    # Estimate: ~5 meetings/week, 4 weeks/month
    meetings_to_find = months * 5 * 4
    print(f"\nBackfill mode: looking for ~{meetings_to_find} meetings ({months} months)")

    conn = get_conn()
    init_db(conn)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-NZ",
        )
        page = context.new_page()
        page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda r: r.abort())

        # Step 1: get meetings visible on the results page
        known_meetings = get_all_meeting_ids_from_results_page(page)

        if not known_meetings:
            print("Could not find any meetings — check your connection.")
            browser.close()
            conn.close()
            return

        # Step 2: find the lowest ID we know about — probe backwards from there
        known_ids = sorted([int(m["id"]) for m in known_meetings])
        lowest_known = known_ids[0]
        highest_known = known_ids[-1]

        print(f"  Known meeting ID range: {lowest_known} → {highest_known}")
        print(f"  Will probe backwards from {lowest_known - 1}...")

        # Collect all meetings to scrape: known + discovered older ones
        all_meetings = {m["id"]: m for m in known_meetings}

        # Probe backwards, skipping IDs we've already scraped
        already_scraped = set(
            row[0] for row in conn.execute("SELECT meeting_id FROM meetings").fetchall()
        )

        found = 0
        consecutive_misses = 0
        probe_id = lowest_known - 1

        while found < meetings_to_find and consecutive_misses < 20:
            mid_str = str(probe_id)

            if mid_str in already_scraped:
                print(f"  [{probe_id}] Already in DB, skipping probe")
                probe_id -= 1
                found += 1  # count it toward our target
                continue

            if mid_str in all_meetings:
                probe_id -= 1
                continue

            print(f"  Probing ID {probe_id}...", end=" ", flush=True)
            result = probe_meeting_id(page, probe_id)

            if result:
                all_meetings[mid_str] = result
                found += 1
                consecutive_misses = 0
                print(f"✓ {result['track']}")
            else:
                consecutive_misses += 1
                print(f"✗ (not found, {consecutive_misses} consecutive misses)")

            probe_id -= 1
            delay()

        print(f"\nDiscovered {len(all_meetings)} total meetings to scrape")

        # Step 3: scrape all meetings, oldest first
        sorted_meetings = sorted(all_meetings.values(), key=lambda m: int(m["id"]))

        total_races = 0
        for i, meeting in enumerate(sorted_meetings):
            print(f"\n[{i+1}/{len(sorted_meetings)}]", end=" ")
            scrape_meeting(page, meeting, conn)
            delay()

        browser.close()

    conn.close()
    print(f"\nBackfill complete!")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

import argparse

def run():
    conn = get_conn()
    init_db(conn)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-NZ",
        )
        page = context.new_page()
        page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda r: r.abort())

        meetings = get_meeting_ids_from_home(page)

        for meeting in meetings:
            scrape_meeting(page, meeting, conn)
            delay()

        browser.close()

    conn.close()
    print("\nAll done!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape loveracing.nz results")
    parser.add_argument("--backfill", action="store_true", help="Backfill historical meetings")
    parser.add_argument("--months", type=int, default=3, help="How many months to backfill (default: 3)")
    args = parser.parse_args()

    if args.backfill:
        backfill(months=args.months)
    else:
        run()
