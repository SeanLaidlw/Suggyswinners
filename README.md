# 🏇 NZ Horse Racing Scraper

Scrapes race results from [loveracing.nz](https://loveracing.nz) and stores them in a local SQLite database for filtering, historical analysis, and head-to-head comparison.

---

## 📁 Project Structure

```
horse-racing-scraper/
├── scraper/
│   ├── scraper.py      # Main Playwright scraper
│   └── scheduler.py    # Daily auto-run scheduler
├── db/
│   └── models.py       # SQLite schema + helpers
├── api/                # (next step) FastAPI query layer
├── requirements.txt
└── README.md
```

---

## ⚙️ Setup

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Install Playwright browser

```bash
playwright install chromium
```

### 3. Initialise the database

```bash
python db/models.py
```

This creates `racing.db` in your project root with all the tables.

---

## 🚀 Running the Scraper

### Scrape today's results
```bash
python scraper/scraper.py
```

### Scrape a specific date
```bash
python scraper/scraper.py --date 2025-03-15
```

### Backfill the last 30 days
```bash
python scraper/scraper.py --backfill --days 30
```

### Run the daily scheduler (keeps running in background)
```bash
python scraper/scheduler.py
```

### Run the scheduler once immediately
```bash
python scraper/scheduler.py --run-now
```

---

## 🗄️ Database Schema

| Table | What it stores |
|-------|---------------|
| `tracks` | Track names, regions, surface types |
| `horses` | Horse names, sire/dam, trainer, owner |
| `jockeys` | Jockey names, apprentice flag |
| `trainers` | Trainer names and location |
| `meetings` | Race meetings: track + date + going |
| `races` | Individual races: name, distance, prize, class |
| `results` | Each runner's finish: position, margin, time, SP |
| `scrape_log` | Audit trail of every scrape attempt |

---

## 🔍 Example SQL Queries

**All wins by a horse:**
```sql
SELECT r.finish_position, rc.race_name, m.date, t.name as track
FROM results r
JOIN horses h ON h.id = r.horse_id
JOIN races rc ON rc.id = r.race_id
JOIN meetings m ON m.id = rc.meeting_id
JOIN tracks t ON t.id = m.track_id
WHERE h.name = 'Omega Boy' AND r.finish_position = 1;
```

**Jockey win rate:**
```sql
SELECT j.name,
       COUNT(*) as total_rides,
       SUM(CASE WHEN r.finish_position = 1 THEN 1 ELSE 0 END) as wins,
       ROUND(100.0 * SUM(CASE WHEN r.finish_position = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as win_pct
FROM results r
JOIN jockeys j ON j.id = r.jockey_id
GROUP BY j.name
ORDER BY win_pct DESC;
```

**Head-to-head: two horses' shared races:**
```sql
SELECT m.date, t.name as track, rc.race_name,
       r1.finish_position as horse1_pos,
       r2.finish_position as horse2_pos
FROM results r1
JOIN results r2 ON r1.race_id = r2.race_id
JOIN horses h1 ON h1.id = r1.horse_id
JOIN horses h2 ON h2.id = r2.horse_id
JOIN races rc ON rc.id = r1.race_id
JOIN meetings m ON m.id = rc.meeting_id
JOIN tracks t ON t.id = m.track_id
WHERE h1.name = 'Horse A' AND h2.name = 'Horse B';
```

---

## ⚠️ Important Notes

- **Respect the site** — The scraper adds 2–5 second delays between requests. Don't remove these.
- **loveracing.nz ToS** — This scraper is intended for personal, non-commercial use. Always check the site's Terms of Service.
- **JS-heavy pages** — The site uses ASP.NET with dynamic content. If selectors break after a site update, inspect the page in DevTools and update the CSS selectors in `scraper.py`.
- **Selector tuning** — The scraper uses multiple fallback selectors but **you will likely need to inspect the live site and tune these** once you run it. See the "Tuning" section below.

---

## 🔧 Tuning Selectors

If the scraper finds 0 meetings or 0 races:

1. Open Chrome → go to `https://loveracing.nz/Results`
2. Open DevTools (F12) → Inspector tab
3. Right-click on a meeting link → "Inspect"
4. Find the CSS class or element structure
5. Update the `selectors` list in `get_meeting_urls()` in `scraper.py`

Do the same for race links on a meeting page and for result table rows.

---

## 🔮 Next Steps

- [ ] Build FastAPI endpoints (`/api/horses`, `/api/results`, `/api/h2h`)
- [ ] Build React frontend with filters + charts
- [ ] Add PostgreSQL support for production
- [ ] Deploy scraper on a VPS with cron
