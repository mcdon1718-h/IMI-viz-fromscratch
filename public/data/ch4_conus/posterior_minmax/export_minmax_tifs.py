"""
Convert the per-year posterior ensemble min/max NetCDF files in this folder
(each one holding all sectors as separate variables, like prior_<year>.nc)
into per-sector-year GeoTIFFs under ../uncertainty/min/ and ../uncertainty/max/,
mirroring the naming used in ../tif/. Then patch ../manifest.json so each
posterior year entry points at its min/max GeoTIFF.

Georeferencing is copied directly from the existing ../tif/<var>_<year>.tif
for the same sector+year, rather than derived from the min/max nc files'
own Latitude/Longitude coordinates -- those coordinates imply a slightly
different origin and pixel size than the already-published central tifs
(same row/col counts, but not the same grid), which would silently
misalign every pixel lookup between the two.

This sandbox does not have xarray/rasterio installed -- run this wherever
those (plus netCDF4) are available, e.g.:

    pip install xarray rasterio netCDF4
    python export_minmax_tifs.py

Run from this directory (posterior_minmax/). There is intentionally no
"_prior" handling: GHGI-prior has no ensemble, so no min/max tif exists for
it, and the frontend hover just shows the central value in that case.
"""

import json
from pathlib import Path

import rasterio
import xarray as xr

HERE          = Path(__file__).resolve().parent
CH4_CONUS_DIR = HERE.parent
MANIFEST_PATH = CH4_CONUS_DIR / "manifest.json"
REF_TIF_DIR   = CH4_CONUS_DIR / "tif"
MIN_TIF_DIR   = CH4_CONUS_DIR / "uncertainty" / "min"
MAX_TIF_DIR   = CH4_CONUS_DIR / "uncertainty" / "max"

YEARS = range(2019, 2025)

# Must match manifest.json's "variables" list / SECTOR_TO_GRID_VAR in
# src/utils/manifestUtils.js -- these are the only sectors wired into the
# frontend's grid mode, so there's no point converting the others.
VARIABLES = [
    "EmisCH4_Total",
    "EmisCH4_Oil",
    "EmisCH4_Gas",
    "EmisCH4_ONG",
    "EmisCH4_Coal",
    "EmisCH4_Livestock",
    "EmisCH4_Wastewater",
    "EmisCH4_Landfills",
    "EmisCH4_Rice",
    "EmisCH4_Reservoirs",
    "EmisCH4_Wetlands",
]

# Observed in these files via `strings`: coordinate/dim names are
# "Latitude" / "Longitude" (capitalized), not the lowercase CF-convention
# names -- hence checking both here.
LAT_DIM_CANDIDATES = ("Latitude", "lat", "latitude", "y")
LON_DIM_CANDIDATES = ("Longitude", "lon", "longitude", "x")


def find_dim(da, candidates):
    for name in candidates:
        if name in da.dims:
            return name
    raise ValueError(f"none of {candidates} found in dims {da.dims}")


def to_geotiff(da, out_path, ref_path):
    """Write a single (lat, lon[, time=1]) DataArray to a GeoTIFF using the
    exact CRS/transform/shape of `ref_path`, so it aligns pixel-for-pixel
    with the already-published central-estimate raster for this sector+year.
    """
    lat_dim = find_dim(da, LAT_DIM_CANDIDATES)
    lon_dim = find_dim(da, LON_DIM_CANDIDATES)

    # Drop any leftover singleton dims (e.g. a size-1 "time" carried through
    # from the ensemble min/max reduction) so we're left with just (lat, lon).
    da = da.squeeze(drop=True)
    da = da.rename({lat_dim: "y", lon_dim: "x"})

    # North-up: descending latitude, matching the reference tif's row order.
    if da.y[0] < da.y[-1]:
        da = da.sortby("y", ascending=False)

    with rasterio.open(ref_path) as ref:
        if (da.sizes["y"], da.sizes["x"]) != (ref.height, ref.width):
            raise ValueError(
                f"{out_path.name}: shape {da.sizes['y']}x{da.sizes['x']} "
                f"doesn't match reference {ref.height}x{ref.width} ({ref_path})"
            )
        profile = ref.profile.copy()

    profile.update(dtype="float32", count=1, compress="deflate")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(da.values.astype("float32"), 1)


def main():
    manifest = json.loads(MANIFEST_PATH.read_text())
    written = {}  # var -> year -> {"minTif": ..., "maxTif": ...}

    for year in YEARS:
        min_path = HERE / f"posterior_ens_min_{year}.nc"
        max_path = HERE / f"posterior_ens_max_{year}.nc"
        if not min_path.exists() or not max_path.exists():
            print(f"[skip] {year}: missing min/max nc file")
            continue

        min_ds = xr.load_dataset(min_path)
        max_ds = xr.load_dataset(max_path)

        for var in VARIABLES:
            if var not in min_ds or var not in max_ds:
                print(f"[skip] {var} {year}: not present in min/max dataset")
                continue

            ref_path = REF_TIF_DIR / f"{var}_{year}.tif"
            if not ref_path.exists():
                print(f"[skip] {var} {year}: no reference tif at {ref_path}")
                continue

            min_tif = MIN_TIF_DIR / f"{var}_{year}_min.tif"
            max_tif = MAX_TIF_DIR / f"{var}_{year}_max.tif"
            to_geotiff(min_ds[var], min_tif, ref_path)
            to_geotiff(max_ds[var], max_tif, ref_path)

            written.setdefault(var, {})[str(year)] = {
                "minTif": f"data/uncertainty/min/{min_tif.name}",
                "maxTif": f"data/uncertainty/max/{max_tif.name}",
            }
            print(f"[ok] {var} {year}")

    # Patch manifest.json in place with the new paths. Posterior years only --
    # there is no ensemble (and so no min/max tif) for "_prior" entries.
    for var, years in written.items():
        for year_key, paths in years.items():
            entry = manifest.get("data", {}).get(var, {}).get(year_key)
            if entry is None:
                print(f"[warn] manifest has no entry for {var}/{year_key}, skipping patch")
                continue
            entry.update(paths)

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Patched {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
