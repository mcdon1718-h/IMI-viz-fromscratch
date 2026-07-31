export const SECTOR_TO_GRID_VAR = {
  Total_ExclSoilAbs: 'EmisCH4_Total',
  ONG:               'EmisCH4_ONG',
  Coal:              'EmisCH4_Coal',
  Livestock:         'EmisCH4_Livestock',
  Wastewater:        'EmisCH4_Wastewater',
  Landfills:         'EmisCH4_Landfills',
  Rice:              'EmisCH4_Rice',
  Reservoirs:        'EmisCH4_Reservoirs',
  Wetlands:          'EmisCH4_Wetlands',
};

export function manifestYearKey(year, satellite) {
  return satellite === 'prior' ? `${year}_prior` : String(year);
}

export function getManifestEntry(manifest, sectorKey, year, satellite) {
  if (!manifest) return null;
  const gridVar = SECTOR_TO_GRID_VAR[sectorKey];
  if (!gridVar) return null;
  const yearKey = manifestYearKey(year, satellite);
  return manifest.data?.[gridVar]?.[yearKey] ?? null;
}

export function getGlobalDomain(manifest, sectorKey) {
  const gridVar = SECTOR_TO_GRID_VAR[sectorKey];
  if (!gridVar) return { min: 0, max: 1 };

  const entries = manifest?.data?.[gridVar];
  if (!entries) return { min: 0, max: 1 };

  let gMax = -Infinity;
  for (const entry of Object.values(entries)) {
    const mx = Number(entry?.max);
    if (Number.isFinite(mx)) gMax = Math.max(gMax, mx);
  }

  return { min: 0, max: Number.isFinite(gMax) ? gMax : 1 };
}

// ── NEW ───────────────────────────────────────────────────────────────────────
// Manifest paths are stored relative to their original data root
// e.g. "data/tif/EmisCH4_Total_2019.tif"
// We strip the leading "data/" and resolve against the dataset's dataRoot.
//
// dataRoot example: "/data/ch4_conus"
// manifestPath:     "data/tif/EmisCH4_Total_2019.tif"
// result:           "/data/ch4_conus/tif/EmisCH4_Total_2019.tif"

export function resolveTifUrl(dataRoot, manifestTifPath) {
  if (!manifestTifPath) return null;
  const stripped = manifestTifPath.replace(/^data\//, '');
  return `${dataRoot}/${stripped}`;
}

// ── Period-keyed manifests (ch4-permian-weekly) ────────────────────────────
// Shape: manifest.data[dataset][variable][periodKey] = { tif, nc, min, max, total_kg }
// dataset  = 'posterior' | 'prior'   (== controls.satellite)
// variable = full manifest variable key, e.g. 'EmisCH4_Total_ExclSoilAbs'   (== controls.sector)
// periodKey = manifest period key, e.g. '27'                               (== controls.period)

export function getPeriodManifestEntry(manifest, dataset, variable, periodKey) {
  if (!manifest || periodKey == null) return null;
  return manifest.data?.[dataset]?.[variable]?.[String(periodKey)] ?? null;
}

export function getPeriodGlobalDomain(manifest, dataset, variable) {
  const entries = manifest?.data?.[dataset]?.[variable];
  if (!entries) return { min: 0, max: 1 };

  let gMax = -Infinity;
  for (const entry of Object.values(entries)) {
    const mx = Number(entry?.max);
    if (Number.isFinite(mx)) gMax = Math.max(gMax, mx);
  }

  return { min: 0, max: Number.isFinite(gMax) ? gMax : 1 };
}

// The manifest's own aggregate variable — every other variable is one of its
// components, so it's excluded from the per-sector breakdown (it would just
// double the total, the same reason emissionsUtils.deriveSectors excludes
// 'Total' for CONUS/global).
export const PERMIAN_TOTAL_VARIABLE = 'EmisCH4_Total_ExclSoilAbs';

// Sector breakdown for one week: total_kg per component variable, at the
// given dataset (satellite) + period. Backs SectorBarChart for ch4-permian-weekly.
export function buildPeriodBarData(manifest, dataset, periodKey) {
  const variables = (manifest?.variables ?? []).filter(v => v.key !== PERMIAN_TOTAL_VARIABLE);
  const key = String(periodKey);

  const labels = [];
  const values = [];
  for (const v of variables) {
    const entry = manifest?.data?.[dataset]?.[v.key]?.[key];
    labels.push(v.label);
    values.push(entry?.total_kg ?? null);
  }
  return { labels, values };
}

// Full weekly time series (all periods, chronological) of total_kg for one
// dataset (satellite) + variable. Backs TimeSeriesPlot for ch4-permian-weekly.
export function buildPeriodLineData(manifest, dataset, variable) {
  const periods = manifest?.periods ?? [];
  const entries = manifest?.data?.[dataset]?.[variable] ?? {};

  const dates  = periods.map(p => p.start);
  const values = periods.map(p => entries[p.key]?.total_kg ?? null);
  return { dates, values };
}

// EDIT THIS to change what counts as "Anthropogenic" for ch4-permian-weekly.
// The manifest has no precomputed anthropogenic aggregate (unlike CONUS/
// Colombia/global, whose CSVs ship one directly), so DataTotals sums the
// component variables itself — Anthropogenic = Total_ExclSoilAbs minus these.
// Current call (2026-07): natural = Wetlands, Lakes, Termites only; Seeps,
// BiomassBurn, and Reservoirs are counted as anthropogenic for now.
export const PERMIAN_NATURAL_VARIABLES = new Set([
  'EmisCH4_Wetlands',
  'EmisCH4_Lakes',
  'EmisCH4_Termites',
]);

// Sums total_kg across every component variable except PERMIAN_TOTAL_VARIABLE
// itself and PERMIAN_NATURAL_VARIABLES, for one dataset (satellite) + period.
export function getPeriodAnthroTotal(manifest, dataset, periodKey) {
  const key = String(periodKey);
  const variables = (manifest?.variables ?? []).filter(
    v => v.key !== PERMIAN_TOTAL_VARIABLE && !PERMIAN_NATURAL_VARIABLES.has(v.key),
  );

  let sum    = 0;
  let hasAny = false;
  for (const v of variables) {
    const val = manifest?.data?.[dataset]?.[v.key]?.[key]?.total_kg;
    if (val != null) { sum += val; hasAny = true; }
  }
  return hasAny ? sum : null;
}