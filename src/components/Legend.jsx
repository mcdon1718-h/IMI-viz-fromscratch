import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';

export function Legend() {
  const { activeDataset } = useDatasetContext();
  const { display } = activeDataset;
  const stops = display.colorScale.stops.sort((a, b) => a[0] - b[0]);
  const gradientCSS = `linear-gradient(to right, ${stops.map(([, c]) => c).join(', ')})`;

  return (
    <div className="legend">
      <div className="legend-title">{display.legendTitle}</div>
      <div className="legend-gradient" style={{ background: gradientCSS }} />
      <div className="legend-ticks">
        <span>{stops[0][0]}</span>
        <span>{stops[stops.length - 1][0]}</span>
      </div>
      <div className="legend-units">{display.units}</div>
    </div>
  );
}