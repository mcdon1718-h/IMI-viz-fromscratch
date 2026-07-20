import sys
import numpy as np
import xarray as xr

VARIABLES = [
    "EmisCH4_Total", "EmisCH4_Oil", "EmisCH4_Gas", "EmisCH4_ONG",
    "EmisCH4_Coal", "EmisCH4_Livestock", "EmisCH4_Wastewater",
    "EmisCH4_Landfills", "EmisCH4_Rice", "EmisCH4_Reservoirs", "EmisCH4_Wetlands",
]

NEAR_ZERO = 1e-9  # anything smaller than this (in absolute value) counts as "near-zero"

def summarize(path):
    ds = xr.load_dataset(path)
    print(f"\n=== {path} ===")
    for var in VARIABLES:
        if var not in ds:
            print(f"{var:20s}  (not present)")
            continue
        vals = ds[var].values.ravel()
        vals = vals[~np.isnan(vals)]
        if vals.size == 0:
            print(f"{var:20s}  all NaN")
            continue
        near_zero_frac = np.mean(np.abs(vals) < NEAR_ZERO)
        print(
            f"{var:20s}  n={vals.size:6d}  "
            f"mean={np.mean(vals):10.4f}  median={np.median(vals):10.4f}  "
            f"min={np.min(vals):10.4f}  max={np.max(vals):10.4f}  "
            f"%near-zero(<{NEAR_ZERO})={100*near_zero_frac:5.1f}%"
        )

if __name__ == "__main__":
    for path in sys.argv[1:]:
        summarize(path)
