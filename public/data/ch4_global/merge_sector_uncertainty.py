"""
Merges per-country sector uncertainty from website_data_withranges.csv into
emissions_data3.csv as `<Sector>_min` / `<Sector>_max` columns — the same
column convention ch4-conus's CSVs already use (see e.g.
public/data/ch4_conus/csv/national_emissions.csv), so SectorBarChart /
buildBarData (emissionsUtils.js) picks them up with no further code changes.

website_data_withranges.csv stores `<Sector>_post_min` / `<Sector>_post_max`
as uncertainty *deltas* (magnitudes in the minus/plus direction), not
absolute bounds — confirmed with the data owner after the values didn't
bracket `<Sector>_post` when read as absolute min/max. So the absolute bound
written out here is `post - min_delta` / `post + max_delta`.

Its sectors are coarser than the bar chart's BAR_SECTOR_KEYS (global.js):
Waste bundles Wastewater+Landfills, Other bundles OtherAnth+BiomassBurn, and
there's no Wetlands/Natural split at all (Total == AnthroTotal in this file).
Per the data owner's instruction, only sectors with a direct 1:1 name match
get real error bars; the bundled/missing sectors are left without a
`_min`/`_max` column entirely (buildBarData already treats a missing column
as "no uncertainty for this bar" via parseNumber(undefined) -> null).

Run from repo root: python public/data/ch4_global/merge_sector_uncertainty.py
"""
import csv

ROOT = "public/data/ch4_global"
RANGES_PATH = f"{ROOT}/website_data_withranges.csv"
CSV_PATH = "public/data/emissions_data3.csv"

# Bar-chart sector key (BAR_SECTOR_KEYS in global.js) -> website_data_withranges.csv
# sector prefix, for the sectors with a direct 1:1 match. Only OilAndGas differs
# in spelling (Oil-Gas there).
SECTOR_TO_RANGES_KEY = {
    "Livestock":  "Livestock",
    "Rice":       "Rice",
    "Coal":       "Coal",
    "Reservoirs": "Reservoirs",
    "OilAndGas":  "Oil-Gas",
}


def load_ranges():
    with open(RANGES_PATH, newline="") as f:
        return {r["countries"].strip(): r for r in csv.DictReader(f)}


def main():
    ranges_by_country = load_ranges()

    with open(CSV_PATH, newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys())

    new_cols = []
    for sector_key in SECTOR_TO_RANGES_KEY:
        new_cols += [f"{sector_key}_min", f"{sector_key}_max"]
    fieldnames += new_cols

    matched, unmatched = 0, []
    for row in rows:
        csv_name = row["countries"].strip()
        ranges_row = ranges_by_country.get(csv_name)
        if ranges_row is None:
            unmatched.append(csv_name)
            for col in new_cols:
                row[col] = ""
            continue
        matched += 1
        for sector_key, ranges_key in SECTOR_TO_RANGES_KEY.items():
            post      = float(ranges_row[f"{ranges_key}_post"])
            min_delta = float(ranges_row[f"{ranges_key}_post_min"])
            max_delta = float(ranges_row[f"{ranges_key}_post_max"])
            row[f"{sector_key}_min"] = post - min_delta
            row[f"{sector_key}_max"] = post + max_delta

    with open(CSV_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Matched {matched}/{len(rows)} countries.")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}) — no uncertainty columns for: {unmatched}")


if __name__ == "__main__":
    main()
