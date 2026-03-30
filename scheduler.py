"""
Scheduler — runs the scraper automatically every day at a set time.

Usage:
    python scheduler.py               # runs forever, scrapes daily at 11pm NZT
    python scheduler.py --run-now     # run once immediately then exit
"""

import argparse
import logging
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

try:
    import schedule
except ImportError:
    print("❌ 'schedule' not installed. Run: pip install schedule")
    sys.exit(1)

from scraper import run


def daily_job():
    log.info("⏰ Scheduled scrape starting...")
    try:
        run([date.today()])
        log.info("✅ Scheduled scrape complete.")
    except Exception as e:
        log.error(f"❌ Scrape failed: {e}", exc_info=True)


def main():
    parser = argparse.ArgumentParser(description="Schedule daily racing scrapes")
    parser.add_argument("--run-now", action="store_true", help="Run immediately then exit")
    parser.add_argument("--time", type=str, default="23:00", help="Time to run daily (24hr, default 23:00)")
    args = parser.parse_args()

    if args.run_now:
        daily_job()
        return

    log.info(f"📅 Scheduler started — will scrape daily at {args.time} NZT")
    schedule.every().day.at(args.time).do(daily_job)

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    main()
