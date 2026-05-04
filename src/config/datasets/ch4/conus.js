import { registerDataset }                     from '../../datasetRegistry';
import { fetchCSV, deriveSectors, labelSector } from '../../../utils/emissionsUtils';

const ALL_YEARS  = [2019, 2020, 2021, 2022, 2023, 2024];
const DATA_ROOT  = '/data/ch4_conus';    // ← single source of truth for this dataset

registerDataset({
  id:       'ch4-conus',
  family:   'CH4',
  name:     'Continental USA',
  dataRoot: DATA_ROOT,                   // ← stored on config so MapView can read it
  description: 'Emissions are derived from the U.S. GHGI and TROPOMI satellite observations. See Estrada et al. (2026) for details.',

  reloadTrigger: [],

  mapConfig: {
    initialViewState: { latitude: 39.5, longitude: -98.5, zoom: 4 },
    minZoom: 3,
    maxZoom: 12,
    maxBounds: [[22, -130], [52, -60]],
  },

  controls: [
  {
    key:     'satellite',
    label:   'Data Source',
    type:    'select',
    options: [
      { value: 'ghgi_tropomi', label: 'GHGI + TROPOMI (Posterior)' },
      { value: 'ghgi',         label: 'GHGI Only (Prior)'          },
    ],
    default: 'ghgi_tropomi',
  },
  {
    key:     'year',
    label:   'Year',
    type:    'slider',
    options: (controls) =>
      controls.satellite === 'ghgi'
        ? [2019, 2020]
        : [2019, 2020, 2021, 2022, 2023, 2024],
    default: 2022,
  },
  {
    key:        'sector',
    label:      'Sector',
    type:       'select',
    getOptions: (baseData) =>
      (baseData?.sectorKeys ?? []).map(s => ({ value: s, label: labelSector(s) })),
    default: 'Total_ExclSoilAbs',
  },
],

  display: {
    units:        'Tg/yr',
    legendTitle:  'CH₄ Emissions',
    legendUnits:  'kg km⁻² h⁻¹',
    colorScale: {
      stops: [
        [0,    '#ffffcc'],
        [0.15, '#feb24c'],
        [0.4,  '#fd8d3c'],
        [0.65, '#e31a1c'],
        [1.0,  '#800026'],
      ],
    },
  },

  async dataLoader() {
    const ROOT = DATA_ROOT;

    const [firstRows, nationalPostRows, nationalPriorRows, statesGeoJSON, manifest] =
      await Promise.all([
        fetchCSV(`${ROOT}/csv/estrada_states_${ALL_YEARS[0]}.csv`),
        fetchCSV(`${ROOT}/csv/national_emissions.csv`),
        fetchCSV(`${ROOT}/csv/national_prior_emissions_2017_2020.csv`),
        fetch(`${ROOT}/ne/us_states_simplified.geojson`).then(r => r.json()),
        fetch(`${ROOT}/manifest.json`).then(r => r.json()),
      ]);

    // ── State CSVs ─────────────────────────────────────────────────────────
    const byYear     = {};
    const sectorKeys = deriveSectors(firstRows[0] ?? {});

    byYear[ALL_YEARS[0]] = {};
    for (const r of firstRows) {
      const name = r.State?.trim();
      if (name) byYear[ALL_YEARS[0]][name] = r;
    }

    await Promise.all(ALL_YEARS.slice(1).map(async (year) => {
      const rows = await fetchCSV(`${ROOT}/csv/estrada_states_${year}.csv`);
      byYear[year] = {};
      for (const r of rows) {
        const name = r.State?.trim();
        if (name) byYear[year][name] = r;
      }
    }));

    // ── National CSVs ──────────────────────────────────────────────────────
    const nationalPosterior = {};
    for (const r of nationalPostRows) {
      const y = Number(r.Year);
      if (Number.isFinite(y)) nationalPosterior[y] = r;
    }

    const nationalPrior = {};
    for (const r of nationalPriorRows) {
      const y = Number(r.Year);
      if (Number.isFinite(y)) nationalPrior[y] = r;
    }

    return {
      byYear,
      nationalPosterior,
      nationalPrior,
      sectorKeys,
      statesGeoJSON,
      manifest,
    };
  },
});