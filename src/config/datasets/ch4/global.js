import { registerDataset }         from '../../datasetRegistry';
import { fetchCSV, parseNumber }   from '../../../utils/emissionsUtils';

const YEAR = 2023; // only year available for this dataset

// Bar chart / sector dropdown sectors — mirrors the original TilingTheWorld
// app's sector list (Termites/Seeps/OtherAnthPlusRes are folded into
// Natural/OtherAnth there and are intentionally not exposed separately here).
const BAR_SECTOR_KEYS = [
  'Reservoirs', 'Natural', 'Wetlands', 'BiomassBurn', 'OtherAnth',
  'Rice', 'Wastewater', 'Landfills', 'Livestock', 'Coal', 'OilAndGas',
];

const SECTOR_OPTIONS = [
  { value: 'TotalAnth',   label: 'Total (Anthropogenic)' },
  { value: 'Livestock',   label: 'Livestock'     },
  { value: 'Coal',        label: 'Coal'          },
  { value: 'OilAndGas',   label: 'Oil & Gas'     },
  { value: 'Rice',        label: 'Rice'          },
  { value: 'Landfills',   label: 'Landfills'     },
  { value: 'Wastewater',  label: 'Wastewater'    },
  { value: 'BiomassBurn', label: 'Biomass Burning' },
  { value: 'OtherAnth',   label: 'Other Anthropogenic' },
  { value: 'Wetlands',    label: 'Wetlands'      },
  { value: 'Natural',     label: 'Natural (Termites & Seeps)' },
  { value: 'Reservoirs',  label: 'Reservoirs'    },
];

// world-countries.json (Natural Earth) identifies features by ADMIN name,
// which diverges from this CSV's "countries" column for a handful of
// countries/territories. Maps CSV name -> ADMIN name so the choropleth join
// (keyed on ADMIN, see MapView's getFeatureName) succeeds for these too.
const ADMIN_ALIASES = {
  'Bahamas':      'The Bahamas',
  'Congo':        'Republic of the Congo',
  'Falkland Is.': 'Falkland Islands',
  'North Cyprus': 'Northern Cyprus',
  'Solomon Is.':  'Solomon Islands',
  'Timor-Leste':  'East Timor',
};

registerDataset({
  id:     'ch4-global',
  family: 'CH4',
  name:   'Global',
  description: 'Global anthropogenic methane emissions by country, derived from bottom-up inventories constrained with TROPOMI satellite observations. Data available for 2023 only.',

  reloadTrigger: [], // load all data once on dataset mount

  mapConfig: {
    initialViewState: { latitude: 20, longitude: 10, zoom: 2 },
    minZoom:   1,
    maxZoom:   8,
    maxBounds: null,
  },

  controls: [
    {
      key:     'satellite',
      label:   'Data Source',
      type:    'select',
      group:   'selects-row',
      options: [
        { value: 'ghgi_tropomi', label: 'Posterior (TROPOMI-corrected)' },
        { value: 'ghgi',         label: 'Prior (Bottom-up Inventory)'   },
      ],
      default: 'ghgi_tropomi',
    },
    {
      key:     'sector',
      label:   'Sector',
      type:    'select',
      group:   'selects-row',
      options: SECTOR_OPTIONS,
      default: 'TotalAnth',
    },
    {
      key:     'year',
      label:   'Year',
      type:    'select',
      options: [{ value: YEAR, label: String(YEAR) }],
      default: YEAR,
    },
  ],

  display: {
    units:       'Tg/yr',
    legendTitle: 'CH₄ Emissions',
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
    const [rows, countriesGeoJSON] = await Promise.all([
      fetchCSV('/data/emissions_data3.csv'),
      fetch('/data/world-countries.json').then(r => {
        if (!r.ok) throw new Error(`world-countries.json: HTTP ${r.status}`);
        return r.json();
      }),
    ]);

    const byYear             = { [YEAR]: {} };
    const stateByYearPrior   = { [YEAR]: {} };
    const worldPosterior     = {};
    const worldPrior         = {};

    const addTo = (acc, key, v) => {
      if (v == null) return;
      acc[key] = (acc[key] ?? 0) + v;
    };

    for (const raw of rows) {
      const csvName = raw.countries?.trim();
      if (!csvName) continue;
      const name = ADMIN_ALIASES[csvName] ?? csvName;

      // byYear: both suffixes present, for choropleth coloring in either
      // Data Source mode (see computeChoroplethDomain / centralCol).
      const row = {};
      // stateByYearPrior: bare keys, prior only — backs the bottom-up bar
      // chart branch (buildBarData's satellite === 'ghgi' path).
      const priorBare = {};

      for (const s of BAR_SECTOR_KEYS) {
        const prior = parseNumber(raw[`${s}_prior`]);
        const post  = parseNumber(raw[`${s}_post`]);
        row[`${s}_prior`]     = prior;
        row[`${s}_posterior`] = post;
        priorBare[s]          = prior;
        addTo(worldPrior,     s, prior);
        addTo(worldPosterior, s, post);
      }

      const totalAnthPrior = parseNumber(raw.Total_Anth_Prior);
      const totalAnthPost  = parseNumber(raw.Total_Anth_Post);
      row.TotalAnth_prior     = totalAnthPrior;
      row.TotalAnth_posterior = totalAnthPost;
      priorBare.TotalAnth      = totalAnthPrior;
      addTo(worldPrior,     'TotalAnth', totalAnthPrior);
      addTo(worldPosterior, 'TotalAnth', totalAnthPost);

      const totalPrior = parseNumber(raw.Total_prior);
      const totalPost  = parseNumber(raw.Total_posterior);
      row.Total_prior     = totalPrior;
      row.Total_posterior = totalPost;
      priorBare.Total      = totalPrior;
      addTo(worldPrior,     'Total', totalPrior);
      addTo(worldPosterior, 'Total', totalPost);

      byYear[YEAR][name]           = row;
      stateByYearPrior[YEAR][name] = priorBare;
    }

    return {
      byYear,
      nationalPosterior: { [YEAR]: worldPosterior },
      nationalPrior:     { [YEAR]: worldPrior },
      stateByYearPrior,
      sectorKeys:    BAR_SECTOR_KEYS,
      statesGeoJSON: countriesGeoJSON,
      manifest:      null,
    };
  },
});
