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
  { value: 'Reservoirs',  label: 'Reservoirs'    },
  { value: 'OtherAnth',   label: 'Other Anthropogenic' },
  { value: 'Wetlands',    label: 'Wetlands'      },
  { value: 'BiomassBurn', label: 'Biomass Burning' },
  { value: 'Natural',     label: 'Other Natural' },
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
  description: 'Annual methane emissions by country at 25-km resolution generated with the IMI using TROPOMI satellite data combined with bottom-up information from national BTRs. See East et al. (2025) for details.',
  /*
  description: 'Annual anthropogenic methane emissions by country at 25 km resolution, from East et al. (2025) . Anthropogenic national emission estimates from UNFCCC reports and natural emission estimates from various inventories are corrected by inversion of TROPOMI satellite methane observations to produce best estimates of emissions.',
  */
  citation: { text: 'East et al. (2025)', url: 'https://www.nature.com/articles/s41467-025-67122-8' },
  satellites: ['TROPOMI'],

  reloadTrigger: [],       // load all data once on dataset mount
  gridType: 'country-mask', // signals MapView to overlay a per-country masked grid on click

  mapConfig: {
    initialViewState: { latitude: 20, longitude: 10, zoom: 2 },
    minZoom:   1,
    maxZoom:   8,
    maxBounds: null,
  },

  controls: [
    /*{
      key:     'viewMode',
      label:   'Map View',
      type:    'radio',
      options: [
        { value: 'grid',       label: 'Grid'       },
        { value: 'choropleth', label: 'Shaded Map' },
      ],
      default: 'choropleth',
    },*/
    {
      key:     'satellite',
      label:   'Data Source',
      type:    'select',
      group:   'selects-row',
      options: [
        { value: 'posterior', label: 'IMI best estimate' },
        { value: 'prior',     label: 'Bottom-up'   },
      ],
      default: 'posterior',
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
    {
      key:     'opacity',
      label:   'Grid Opacity',
      type:    'slider',
      options: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      default: 0.75,
      format:  v => `${Math.round(v * 100)}%`,
      visible: (controls, { selectedState }) => !!selectedState,
    },
    {
      key:     'choroplethOpacity',
      label:   'Shaded Map Opacity',
      type:    'slider',
      options: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      default: 0.65,
      format:  v => `${Math.round(v * 100)}%`,
    },
  ],

  display: {
    units:            'Tg/yr',
    legendTitle:      'CH₄ Emissions',
    legendUnits:      'Tg/yr',
    defaultPlaceLabel: 'Global', // shown in chart headers when no country is selected
    totalsLabels: { bottomUp: 'Bottom-up', posterior: 'IMIBest Estimate' }, // column headers on the DataTotals table
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
    const [rows, countriesGeoJSON, usStatesGeoJSON] = await Promise.all([
      fetchCSV(`${import.meta.env.BASE_URL}data/emissions_data3.csv`),
      fetch(`${import.meta.env.BASE_URL}data/world-countries.json`).then(r => {
        if (!r.ok) throw new Error(`world-countries.json: HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`${import.meta.env.BASE_URL}data/ne/us_states_simplified.geojson`).then(r => {
        if (!r.ok) throw new Error(`us_states_simplified.geojson: HTTP ${r.status}`);
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
      // chart branch (buildBarData's satellite === 'prior' path).
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
      sectorKeys:      BAR_SECTOR_KEYS,
      statesGeoJSON:   countriesGeoJSON,
      usStatesGeoJSON,
      manifest:        null,
    };
  },
});
