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