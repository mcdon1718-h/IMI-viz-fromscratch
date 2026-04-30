import { registerFamily } from '../familyRegistry';

registerFamily({
  id:          'CH4',
  name:        'Methane',
  label:       'CH₄',
  description: 'Methane emissions derived from satellite remote sensing observations.',
  theme: {
    accent:     '#f59e0b',               // amber
    accentDim:  'rgba(245,158,11,0.15)',
    accentText: '#1c0a00',
  },
});
