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
    # Generic distance words
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

# Known NZ named races with fixed distances
# Source: NZTR race conditions
KNOWN_RACE_DISTANCES = {
    "NZ DERBY":                          2400,
    "NEW ZEALAND DERBY":                 2400,
    "NZ OAKS":                           2400,
    "NEW ZEALAND OAKS":                  2400,
    "NZ ST LEGER":                       2400,
    "NEW ZEALAND ST LEGER":              2400,
    "AUCKLAND CUP":                      3200,
    "TRACKSIDE AUCKLAND CUP":            3200,
    "WELLINGTON CUP":                    3200,
    "NZ CUP":                            3200,
    "CHRISTCHURCH CUP":                  2000,
    "NEW ZEALAND CUP":                   3200,
    "MARTIN COLLINS NEW ZEALAND CUP":    3200,
    "MANAWATU CUP":                      2000,
    "WAIKATO CUP":                       2400,
    "SKYCITY HAMILTON WAIKATO CUP":      2400,
    "TAUPO CUP":                         2100,
    "HARCOURTS TAUPO CUP":               2100,
    "ROTORUA CUP":                       2000,
    "JAPAN TROPHY":                      2000,
    "ULTIMATE MAZDA JAPAN TROPHY":       2000,
    "ZABEEL CLASSIC":                    2000,
    "CAMBRIDGE STUD ZABEEL CLASSIC":     2000,
    "ECLIPSE STAKES":                    1600,
    "SKYCITY ECLIPSE STAKES":            1600,
    "RAILWAY":                           1200,
    "SISTEMA RAILWAY":                   1200,
    "TELEGRAPH":                         1200,
    "TAB TELEGRAPH":                     1200,
    "TELEGRAPH HANDICAP":                1200,
    "BONECRUSHER STAKES":                2000,
    "BONECRUSHER NEW ZEALAND STAKES":    2000,
    "CONCORDE STAKES":                   1400,
    "SISTEM STAKES":                     1200,
    "SISTEMA STAKES":                    1200,
    "QUEEN ELIZABETH II CUP":            2000,
    "QUEEN ELIZABETH CUP":               2000,
    "QE II CUP":                         2000,
    "KARAKA MILLIONS 2YO":               1200,
    "TAB KARAKA MILLIONS 2YO":           1200,
    "KARAKA MILLIONS 3YO":               1600,
    "TAB KARAKA MILLIONS 3YO":           1600,
    "THE NZB KIWI":                      1200,
    "NZB KIWI":                          1200,
    "AVONDALE CUP":                      2400,
    "EAGLE TECHNOLOGY AVONDALE CUP":     2400,
    "AVONDALE GUINEAS":                  1600,
    "UNCLE REMUS STAKES":                1200,
    "THORNDON MILE":                     1600,
    "BREEDERS STAKES":                   1400,
    "NZ THOROUGHBRED BREEDERS STAKES":   1400,
    "LOWLAND STAKES":                    2100,
    "JENNIAN HOMES LOWLAND STAKES":      2100,
    "MANAWATU SIRES PRODUCE":            1400,
    "HERBIE DYKE STAKES":                2000,
    "WAIKATO GUINEAS":                   1600,
    "LEGACY LODGE WAIKATO GUINEAS":      1600,
    "AUCKLAND GUINEAS":                  1600,
    "JIMMY SCHICK SHAWS AUCKLAND GUINEAS": 1600,
    "EIGHT CARAT CLASSIC":               1400,
    "HALLMARK STUD EIGHT CARAT CLASSIC": 1400,
    "MANAWATU CLASSIC":                  1400,
    "FLYING HANDICAP":                   1200,
    "BRAMCO GRANITE MARBLE FLYING HANDICAP": 1200,
    "OTAKI MAORI WFA":                   1600,
    "PEARL SERIES":                      1400,
    "NZB INSURANCE PEARL SERIES":        1400,
    "PEARL SERIES FINAL":                1600,
    "COUNTIES CUP":                      2100,
    "MYRACEHORSE COUNTIES CUP":          2100,
    "COUNTIES CHALLENGE STAKES":         1200,
    "COUNTIES BOWL":                     1200,
    "HAUNUI FARM COUNTIES BOWL":         1200,
    "AUCKLAND THOROUGHBRED BREEDERS STAKES": 1200,
    "DUNSTAN HORSEFEEDS AUCKLAND THOROUGHBRED BREEDERS STAKES": 1200,
    "NORTHLAND CUP":                     2100,
    "TRIGG CONSTRUCTION NORTHLAND CUP":  2100,
    "SOUTH ISLAND THOROUGHBRED BREEDERS STAKES": 1000,
    "DONALDSON BROWN SOUTH ISLAND THOROUGHBRED BREEDERS STAKES": 1000,
    "CHAMPAGNE STAKES":                  1200,
    "LISA CHITTICK CHAMPAGNE STAKES":    1200,
    "MATAMATA SLIPPER":                  1000,
    "FAIRVIEW MATAMATA SLIPPER":         1000,
    "MATAMATA BREEDERS STAKES":          1400,
    "WAIRERE FALLS CLASSIC":             1600,
    "KAIMAI STAKES":                     1200,
    "TRENTHAM STAKES":                   2100,
    "TOTARA LODGE TRENTHAM STAKES":      2100,
    "WELLINGTON STAKES":                 2000,
    "JENNIAN HOMES WELLINGTON STAKES":   2000,
    "WELLINGTON GUINEAS":                1600,
    "TAYLOR PROPERTY PLUS WELLINGTON GUINEAS": 1600,
    "REMUTAKA CLASSIC":                  1600,
    "LIFE DIRECT REMUTAKA CLASSIC":      1600,
    "DOURO CUP":                         2400,
    "JOHN TURKINGTON FORESTRY DOURO CUP": 2400,
    "CITY OF PALMERSTON NORTH AWAPUNI GOLD CUP": 2000,
    "INTOWIN CITY OF PALMERSTON NORTH AWAPUNI GOLD CUP": 2000,
    "MANAWATU CHALLENGE STAKES":         1400,
    "BRAMCO GRANITE MARBLE MANAWATU CHALLENGE STAKES": 1400,
    "WAKEFIELD CHALLENGE STAKES":        1400,
    "WINDSOR PARK STUD WAKEFIELD CHALLENGE STAKES": 1400,
    "EULOGY STAKES":                     1600,
    "LAWNMASTER EULOGY STAKES":          1600,
    "LIGHTNING HANDICAP":                1000,
    "CAREVETS NZ LIGHTNING HANDICAP":    1000,
    "STAYERS CHAMPIONSHIP":              2400,
    "DUNSTAN HORSEFEEDS STAYERS CHAMPIONSHIP FINAL": 2400,
    "DUNSTAN HORSEFEEDS STAYERS CHAMPIONSHIP QUALIFIER": 2000,
    "SIR PATRICK HOGAN STAKES":          1200,
    "SIR PATRICK HOGAN KARAPIRO CLASSIC": 1600,
    "KARAPIRO CLASSIC":                  1600,
    "GRANGEWILLIAM STUD OAKS PRELUDE":   2000,
    "OAKS PRELUDE":                      2000,
    "TARANAKI CUP":                      2000,
    "DENIS WHEELER EARTHMOVING TARANAKI CUP": 2000,
    "WANGANUI CUP":                      2040,
    "STEELFORM ROOFING GROUP WANGANUI CUP": 2040,
    "INVERCARGILL GOLD CUP":             1600,
    "OLPHERT CONTRACTING LTD INVERCARGILL GOLD CUP": 1600,
    "SOUTHLAND GUINEAS":                 1600,
    "ILT ASCOT PARK HOTEL SOUTHLAND GUINEAS": 1600,
    "SOUTHLAND STAKES":                  1400,
    "CRUICKSHANK PRYDE SOUTHLAND STAKES": 1400,
    "GORE CUP":                          2000,
    "KB CONTRACTORS MLT GORE CUP":       2000,
    "TIMARU STAKES":                     1400,
    "SPEIGHTS TIMARU STAKES":            1400,
    "MARLBOROUGH CUP":                   2000,
    "WOODBOURNE TAVERN MOTELS BOTTLEO RENWICK MARLBOROUGH CUP": 2000,
    "DUNEDIN GOLD CUP":                  2000,
    "POSITIVE SIGNS PRINT DUNEDIN GOLD CUP": 2000,
    "DUNEDIN GUINEAS":                   1600,
    "PROPERTY BROKERS RAY KEAN DUNEDIN GUINEAS": 1600,
    "GREAT NORTHERN CHALLENGE STAKES":   1600,
    "BAYLEYS GREAT NORTHERN CHALLENGE STAKES": 1600,
    "OLEARYS FILLIES STAKES":            1400,
    "BANKS PENINSULA CUP":               2000,
    "THAMES COROMANDEL EAST WAIKATO GOLD CUP": 2100,
    "LOCKWOOD THAMES COROMANDEL EAST WAIKATO GOLD CUP": 2100,
    "WELLESLEY STAKES":                  1200,
    "JR N BERKETT WELLESLEY STAKES":     1200,
    "MARTON CUP":                        2200,
    "PHAR LAP TROPHY":                   1600,
    "RON STANLEY MEMORIAL PHAR LAP TROPHY": 1600,
    "LEVIN CLASSIC":                     1600,
    "LEVIN TRUCK SERVICES LEVIN STAKES": 1600,
    "LEVIN STAKES":                      1600,
    "HAPPY HIRE CUP":                    1400,
    "GARTSHORE CONSTRUCTION TAURANGA STAKES": 1400,
    "TAURANGA STAKES":                   1400,
    "SOUTH WAIKATO CUP":                 2000,
    "HOLSTER ENGINEERING LALLY SYMES SOUTH WAIKATO CUP": 2000,
    "MANAWATU SIRES PRODUCE STAKES":     1400,
    "COURTESY FORD MANAWATU SIRES PRODUCE STAKES": 1400,
    "ALMANZOR TROPHY":                   1600,
    "CAMBRIDGE STUD ALMANZOR TROPHY":    1600,
    "AOTEAROA CLASSIC":                  1600,
    "ELSDON PARK AOTEAROA CLASSIC":      1600,
    "ELSDON PARK PLATE":                 1200,
    "KINGS PLATE":                       1600,
    "HAUNUI FARM KINGS PLATE":           1600,
    "MUFHASA CLASSIC":                   1400,
    "TAB MUFHASA CLASSIC":               1400,
    "COLIN JILLINGS 2YO CLASSIC":        1000,
    "FULTON FAMILY STAKES":              1400,
    "DESERT GOLD STAKES":                1200,
    "NZB DESERT GOLD STAKES":            1200,
    "NZB AIRFREIGHT STAKES":             1200,
    "WINDSOR PARK STUD 3YO TROPHY":      1600,
    "AL BASTI EQUIWORLD DUBAI CLASSIC":  1600,
    "AL BASTI EQUIWORLD DUBAI NEW ZEALAND OAKS": 2400,
    "SKYCITY ECLIPSE STAKES":            1600,
    "RICCARTON PARK THANKS GOLD CLUB MEMBERS TWO YEAR OLD": 1000,
    "METROPOLITAN TROPHY":               2000,
    "NAUTICAL BOAT INSURANCE METROPOLITAN TROPHY": 2000,
    "PEGASUS STAKES":                    1200,
    "DONALDSON BROWN PEGASUS STAKES":    1200,
    "CANTERBURY BREEDERS STAKES":        1200,
    "WINDSOR PARK STUD CANTERBURY BREEDERS STAKES": 1200,
    "OTAKI MAORI WFA CLASSIC":           1600,
    "SPORT NATION OTAKI MAORI WFA CLASSIC": 1600,
    "RYDGES WELLINGTON CUDDLE STAKES":   1200,
    "SOUTHERN ALPS GOLDEN TICKET RACE":  1400,
    "TAB SOUTHERN ALPS GOLDEN TICKET RACE": 1400,
    "WAIPUKURAU CUP":                    2000,
    "DMAK ELECTRICAL WAIPUKURAU CUP":    2000,
    "CENTRAL SOUTHLAND CUP":             2000,
    "COUNTRY JEWEL MIDDLE PUB CENTRAL SOUTHLAND CUP": 2000,
    "WINTON CUP":                        1600,
    "GLADVALE FARMS WINTON CUP":         1600,
    "TAPANUI CUP":                       2000,
    "DYNES TRANSPORT TAPANUI CUP":       2000,
    "HOROWHENUA CHRISTMAS CUP":          1600,
    "ROBERT WALTERS HOROWHENUA CHRISTMAS CUP": 1600,
    "WAIROA CUP":                        1600,
    "K9 PETFOODS LTD WAIROA CUP":        1600,
}


def extract_distance(race_name: str) -> int | None:
    if not race_name:
        return None

    name_upper = race_name.upper().strip()
    # Normalise - remove punctuation for matching
    name_clean = re.sub(r"[^A-Z0-9 ]", " ", name_upper)
    name_clean = re.sub(r"\s+", " ", name_clean).strip()

    # 1. Check known named races first (most reliable)
    for race_key, metres in KNOWN_RACE_DISTANCES.items():
        if race_key.upper() in name_clean:
            return metres

    # 2. Named distance words
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
            # (Re-scraping this meeting will attempt to get distance from the race detail page)
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
