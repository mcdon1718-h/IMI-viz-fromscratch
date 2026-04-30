import { registerFamily } from '../familyRegistry';

registerFamily({
  id:          'CO2',
  name:        'Carbon Dioxide',
  label:       'CO₂',
  description: 'Carbon dioxide emissions from combustion, industry, and land-use change.',
  theme: {
    accent:     '#3b82f6',               // blue
    accentDim:  'rgba(59,130,246,0.15)',
    accentText: '#eff6ff',
  },
});
