// Shared scans over parsed grid data, used wherever a single aggregate
// statistic is needed per grid (domain max, sector-total bar chart, etc).
// Consistently ignores null/no-data cells and non-positive values, matching
// the no-data convention used throughout the map rendering (values <= 0
// are treated as absent, same as MapView's pixel lookups).

function reduceRasterValues(georaster, reducer, initial) {
  const band = georaster?.values?.[0];
  if (!band) return initial;
  const noDataValue = georaster.noDataValue;
  let acc = initial;
  for (let r = 0; r < band.length; r++) {
    const row = band[r];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v == null) continue;
      if (noDataValue != null && v === noDataValue) continue;
      if (!Number.isFinite(v) || v <= 0) continue;
      acc = reducer(acc, v);
    }
  }
  return acc;
}

export function rasterMax(georaster) {
  const max = reduceRasterValues(georaster, (acc, v) => Math.max(acc, v), 0);
  return max > 0 ? max : null;
}

export function rasterSum(georaster) {
  return reduceRasterValues(georaster, (acc, v) => acc + v, 0);
}

export function flatArraySum(values) {
  let sum = 0;
  for (const v of values ?? []) {
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}
