import { registerFamily } from '../familyRegistry';

registerFamily({
  id:          'UPLOAD',
  name:        'Your Data',
  label:       'Upload',
  dashboardTitle: 'Upload Viewer',
  description: `Upload your own single-band GeoTIFF or JSON value grid to view it on the map. JSONs are strongly recommended for lighter computational load. GeoTIFFs are supported for convenience, but your browser may be slow for larger files. GeoTIFFs must be in geographic WGS84 (EPSG:4326). 

Uploaded datasets are not included in the library of stored research results in the CH₄ and CO₂ tabs. Upon publication, your results can be added to the library by reaching out to the IMI team. This window serves as a useful testbed to ensure your data is properly formatted prior to submission.`,
  theme: {
    accent:     '#22c55e',               // green
    accentDim:  'rgba(34,197,94,0.15)',
    accentText: '#052e13',
  },
});
