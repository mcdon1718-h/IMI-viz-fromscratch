import { registerDataset } from '../../datasetRegistry';

registerDataset({
  id:     'ch4-global',
  family: 'CH4',
  name:   'Global',
  description: 'Worldwide methane column concentrations from satellite observations.',

  mapConfig: {
    initialViewState: { longitude: 10, latitude: 20, zoom: 1.8 },
    minZoom: 1,
    maxZoom: 8,
    maxBounds: null,
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
  },

  controls: [
    {
      key:     'year',
      label:   'Year',
      type:    'slider',
      options: [2018, 2019, 2020, 2021, 2022],
      default: 2021,
    },
    {
      key:     'satellite',
      label:   'Satellite Source',
      type:    'select',
      options: [
        { value: 'TROPOMI', label: 'TROPOMI (Sentinel-5P)' },
        { value: 'GOSAT',   label: 'GOSAT'                 },
        { value: 'GOSAT2',  label: 'GOSAT-2'               },
      ],
      default: 'TROPOMI',
    },
    {
      key:     'sector',
      label:   'Sector',
      type:    'select',
      options: [
        { value: 'all',         label: 'All Sectors' },
        { value: 'oil_gas',     label: 'Oil & Gas'   },
        { value: 'agriculture', label: 'Agriculture' },
        { value: 'waste',       label: 'Waste'       },
        { value: 'wetlands',    label: 'Wetlands'    },
      ],
      default: 'all',
    },
    {
      key:     'aggregation',
      label:   'View By',
      type:    'radio',
      options: [
        { value: 'grid',    label: 'Grid'    },
        { value: 'country', label: 'Country' },
        { value: 'region',  label: 'Region'  },
      ],
      default: 'grid',
    },
  ],

  display: {
    units: 'ppb',
    colorScale: {
      stops: [
        [1750, '#fff7bc'],
        [1820, '#fec44f'],
        [1870, '#d95f0e'],
        [1950, '#7f0000'],
      ],
    },
    legendTitle: 'CH₄ Column Avg (ppb)',
  },

  async dataLoader(controls) {
    // Stub — replace with real endpoint when API is ready
    return { type: 'FeatureCollection', features: [] };

    // const res = await fetch(`/api/ch4/global?${new URLSearchParams(controls)}`);
    // if (!res.ok) throw new Error(`CH4/Global fetch failed: ${res.statusText}`);
    // return res.json();
  },
});
