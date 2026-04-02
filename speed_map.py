"""
speed_map.py - Speed ratings for NZ racing

NZ-specific approach:
- Par = average WINNER time per track/distance (all going conditions)
- No going adjustment - par already reflects typical conditions at each track
- Figure = 100 + (par - actual_time) * distance_factor
  100 = ran at par, >100 = faster, <100 = slower
- Minimum 3 winner samples for reliable par
- Fall back to global distance par for tracks with <3 samples

Run: python3 speed_map.py
Import: from speed_map import get_speed_figures, get_par_times
"""
import sqlite3
from collections import defaultdict

DB = "racing.db"

MIN_SAMPLES = 3      # minimum winners to trust a track/distance par
BASE_FACTOR = 10     # points per second at 1200m baseline
BASELINE_DIST = 1200
CAP_HIGH = 135
CAP_LOW  = 60

def time_to_secs(t):
    if not t: return None
    try:
        parts = t.split('.')
        if len(parts) == 3:
            return int(parts[0])*60 + int(parts[1]) + int(parts[2])/100
        if len(parts) == 2:
            return int(parts[0])*60 + float(parts[1])
    except:
        return None

def secs_to_display(s):
    if not s: return '--'
    m = int(s // 60)
    sec = s % 60
    return f"{m}:{sec:05.2f}"

def get_par_times(db_path=DB):
    """Returns {(track, distance): (par_secs, n_samples)} for all track/dist combos."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    winners = conn.execute("""
        SELECT res.finish_time, t.name AS track, r.distance_m
        FROM results res
        JOIN races r ON r.id = res.race_fk
        JOIN meetings m ON m.id = r.meeting_fk
        JOIN tracks t ON t.id = m.track_id
        WHERE res.finish_position = 1
        AND res.finish_time IS NOT NULL
        AND r.distance_m IS NOT NULL
    """).fetchall()
    conn.close()

    par_data = defaultdict(list)
    global_data = defaultdict(list)

    for w in winners:
        secs = time_to_secs(w['finish_time'])
        if not secs: continue
        dist = w['distance_m']
        # Tighter sanity: realistic NZ race times per distance
        # min = world record pace (~17m/s), max = very slow heavy (~11m/s)
        min_t = dist / 17.0
        max_t = dist / 11.0
        if not (min_t < secs < max_t): continue

        par_data[(w['track'], dist)].append(secs)
        global_data[dist].append(secs)

    pars = {}
    import statistics
    for (track, dist), times in par_data.items():
        # Use median - much more robust to outlier times from scraper bugs
        par = statistics.median(times)
        pars[(track, dist)] = (par, len(times))

    global_pars = {dist: statistics.median(t) for dist, t in global_data.items() if len(t) >= 3}

    return pars, global_pars

def get_speed_figures(db_path=DB):
    """Returns list of speed figure dicts for all timed results."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT
            res.finish_position, res.finish_time,
            h.name AS horse,
            t.name AS track,
            m.date, m.going,
            r.distance_m, r.race_name, r.race_class,
            r.id as race_id
        FROM results res
        JOIN horses h ON h.id = res.horse_id
        JOIN races r ON r.id = res.race_fk
        JOIN meetings m ON m.id = r.meeting_fk
        JOIN tracks t ON t.id = m.track_id
        WHERE res.finish_time IS NOT NULL
        AND r.distance_m IS NOT NULL
        AND res.finish_position > 0
        AND res.finish_position <= 20
    """).fetchall()

    pars, global_pars = get_par_times(db_path)
    figures = []

    for r in rows:
        secs = time_to_secs(r['finish_time'])
        if not secs: continue

        dist = r['distance_m']
        min_t = dist / 17.0
        max_t = dist / 11.0
        if not (min_t < secs < max_t): continue

        key = (r['track'], dist)

        if key in pars and pars[key][1] >= MIN_SAMPLES:
            par, n = pars[key]
            reliable = True
        elif key in pars:
            par, n = pars[key]
            reliable = False  # fewer than MIN_SAMPLES winners
        elif dist in global_pars:
            par = global_pars[dist]
            n = 0
            reliable = False
        else:
            continue

        dist_factor = BASE_FACTOR * (BASELINE_DIST / dist)
        fig = round(max(CAP_LOW, min(CAP_HIGH, 100 + (par - secs) * dist_factor)), 1)

        figures.append({
            'horse':           r['horse'],
            'track':           r['track'],
            'date':            r['date'],
            'distance_m':      dist,
            'going':           r['going'],
            'finish_time':     r['finish_time'],
            'par_secs':        par,
            'finish_position': r['finish_position'],
            'figure':          fig,
            'reliable':        reliable,
            'race_id':         r['race_id'],
        })

    conn.close()
    return figures

def main():
    pars, global_pars = get_par_times()
    print(f"Par times calculated: {len(pars)} track/distance combos")
    print(f"Global distance pars: {len(global_pars)}\n")

    print(f"{'Track':<45} {'Dist':>6} {'Par':>8} {'N':>4} {'Reliable'}")
    print("-" * 80)
    for (track, dist), (par, n) in sorted(pars.items()):
        rel = 'Y' if n >= MIN_SAMPLES else 'N'
        print(f"{track:<45} {dist:>6}m {secs_to_display(par):>8} {n:>4}  {rel}")

    print(f"\nGlobal pars by distance:")
    for dist, par in sorted(global_pars.items()):
        print(f"  {dist}m: {secs_to_display(par)}")

    figures = get_speed_figures()
    print(f"\nTotal figures: {len(figures)}")
    print(f"Reliable: {sum(1 for f in figures if f['reliable'])}")

    # Distribution
    from collections import defaultdict as dd
    buckets = dd(int)
    for f in figures:
        buckets[round(f['figure']/5)*5] += 1
    print(f"\n--- FIGURE DISTRIBUTION ---")
    for b in sorted(buckets):
        bar = '#' * (buckets[b]//30)
        print(f"  {b:>5}: {bar} ({buckets[b]})")

    # Top horses by career best (reliable only)
    reliable = [f for f in figures if f['reliable']]
    horse_best = {}
    for f in reliable:
        h = f['horse']
        if h not in horse_best or f['figure'] > horse_best[h]['figure']:
            horse_best[h] = f

    top = sorted(horse_best.values(), key=lambda x: x['figure'], reverse=True)[:20]
    print(f"\n--- TOP 20 HORSES BY CAREER BEST ---")
    print(f"{'Horse':<25} {'Best':>6} {'Track':<35} {'Date':<12} {'Dist':>5} {'Going'}")
    print("-" * 100)
    for h in top:
        print(f"{h['horse']:<25} {h['figure']:>6.1f} {h['track']:<35} "
              f"{h['date']:<12} {h['distance_m']:>5}m {h['going']}")

if __name__ == '__main__':
    main()
