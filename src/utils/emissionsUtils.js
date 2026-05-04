// parses input emissions data from satellite(s)

import Papa from 'papaparse';

// ─── Constants (match your app.js) ───────────────────────────────────────────
export const SCENARIO_SUFFIX  = '_posterior';
export const DEFAULT_SECTOR   = 'Total_ExclSoilAbs';
export const EXCLUDED_SECTORS = [
  'Total', 'OtherAnth', 'Gas', 'Oil',
  'Lakes', 'Seeps', 'Termites', 'SoilAbsorb',
];
export const SECTOR_LABELS = {
  ONG:               'Oil/Gas',
  Livestock:         'Livestock',
  Total_ExclSoilAbs: 'Total',
};

// ─── CSV fetch ────────────────────────────────────────────────────────────────
export function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download:      true,
      header:        true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error:    reject,
    });
  });
}

// ─── Derive sector keys from a CSV row (same logic as app.js) ─────────────────
export function deriveSectors(row) {
  return Object.keys(row)
    .filter(k => k.endsWith(SCENARIO_SUFFIX))
    .map(k => k.replace(SCENARIO_SUFFIX, ''))
    .filter(s => s !== 'Total')
    .filter(s => !EXCLUDED_SECTORS.includes(s))
    .sort();
}

export function labelSector(key) {
  return SECTOR_LABELS[key] ?? key;
}

export function parseNumber(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

// ─── Column name helpers ──────────────────────────────────────────────────────
export function mapValueCol(satellite) {
  return satellite === 'ghgi' ? 'Total_prior' : 'Total_posterior';
}

export function centralCol(sectorKey, mode, satellite) {
  if (mode === 'national') return sectorKey;  // national CSV has no suffix
  return satellite === 'ghgi'
    ? `${sectorKey}_prior`
    : `${sectorKey}_posterior`;
}

export function minCol(key) { return `${key}_min`; }
export function maxCol(key) { return `${key}_max`; }

export function hasUncertainty(satellite) {
  return satellite !== 'ghgi';
}

// Which years are valid for each data source
export function activeYears(satellite) {
  return satellite === 'ghgi'
    ? [2019, 2020]
    : [2019, 2020, 2021, 2022, 2023, 2024];
}

// ─── Bar chart data builder ───────────────────────────────────────────────────
export function buildBarData(baseData, { year, mode, satellite, selectedState }) {
  const { byYear, nationalPosterior, nationalPrior, sectorKeys } = baseData;

  let row;
  if (mode === 'national') {
    row = satellite === 'ghgi'
      ? (nationalPrior?.[year]     ?? null)
      : (nationalPosterior?.[year] ?? null);
  } else {
    row = selectedState ? (byYear?.[year]?.[selectedState] ?? null) : null;
  }

  if (!row || !sectorKeys.length) {
    return { labels: [], values: [], mins: [], maxs: [] };
  }

  const values = sectorKeys.map(s =>
    parseNumber(row[centralCol(s, mode, satellite)])
  );

  if (!hasUncertainty(satellite)) {
    return { labels: sectorKeys, values, mins: values.map(() => null), maxs: values.map(() => null) };
  }

  return {
    labels: sectorKeys,
    values,
    mins: sectorKeys.map(s => parseNumber(row[minCol(s)])),
    maxs: sectorKeys.map(s => parseNumber(row[maxCol(s)])),
  };
}

// ─── Time series data builder ─────────────────────────────────────────────────
export function buildLineData(baseData, { mode, sectorKey, satellite, selectedState }) {
  const { byYear, nationalPosterior, nationalPrior } = baseData;
  const years = activeYears(satellite);

  function getRow(year) {
    if (mode === 'national') {
      return satellite === 'ghgi'
        ? (nationalPrior?.[year]     ?? null)
        : (nationalPosterior?.[year] ?? null);
    }
    return selectedState ? (byYear?.[year]?.[selectedState] ?? null) : null;
  }

  const values = years.map(y => {
    const row = getRow(y);
    return row ? parseNumber(row[centralCol(sectorKey, mode, satellite)]) : null;
  });

  if (!hasUncertainty(satellite)) {
    return { years, values, mins: years.map(() => null), maxs: years.map(() => null) };
  }

  return {
    years,
    values,
    mins: years.map(y => { const r = getRow(y); return r ? parseNumber(r[minCol(sectorKey)]) : null; }),
    maxs: years.map(y => { const r = getRow(y); return r ? parseNumber(r[maxCol(sectorKey)]) : null; }),
  };
}
// Compute min/max of state values for the current year/satellite
// Used by both MapView (choropleth coloring) and Legend (tick labels)
export function computeChoroplethDomain(baseData, year, satellite, sector) {
  if (!baseData?.byYear?.[year]) return { min: 0, max: 10 };

  // Use centralCol so sector selection is respected
  // mode is always 'state' here — we are coloring individual states
  const col    = centralCol(sector, 'state', satellite);
  const values = Object.values(baseData.byYear[year])
    .map(row => parseNumber(row[col]))
    .filter(v => v != null && Number.isFinite(v));

  if (!values.length) return { min: 0, max: 10 };
  return { min: Math.min(...values), max: Math.max(...values) };
}