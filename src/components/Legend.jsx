import React, { useMemo }         from 'react';
import { useDatasetContext }       from '../context/DatasetContext';
import { useEmissionData }         from '../hooks/useEmissionData';
import { getGlobalDomain }         from '../utils/manifestUtils';
import { computeChoroplethDomain } from '../utils/emissionsUtils';

const GRADIENT = `linear-gradient(to right,
  #ffffcc, #ffeda0, #fed976, #feb24c,
  #fd8d3c, #fc4e2a, #e31a1c, #bd0026, #800026)`;

export function Legend() {
  const { activeDataset, controls, jsonGridDomain } = useDatasetContext();
  const { data: baseData }                          = useEmissionData();
  const { display }                                 = activeDataset;

  const isGrid       = controls.viewMode === 'grid';
  const isChoropleth = !isGrid;

  const rasterDomain = useMemo(() => {
  if (!isGrid) return null;

  // CONUS — manifest carries a pre-computed global max per sector/year
  if (baseData?.manifest) {
    const global = getGlobalDomain(baseData.manifest, controls.sector);
    return { min: global.min, max: global.max * (controls.maxEmission ?? 1.0) };
  }

  // Colombia (JSON grid) — max is reported dynamically by JsonGridLayer
  // after it finishes loading; shows '—' in the legend until that first load
  if (jsonGridDomain != null) {
    return { min: 0, max: jsonGridDomain.max * (controls.maxEmission ?? 1.0) };
  }

  return null;
}, [isGrid, baseData, controls.sector, controls.maxEmission, jsonGridDomain]);

  const choroplethDomain = useMemo(() => {
    if (!isChoropleth || !baseData) return null;
    return computeChoroplethDomain(
      baseData, controls.year, controls.satellite, controls.sector,
    );
  }, [isChoropleth, baseData, controls.year, controls.satellite, controls.sector]);

  const domain = isGrid ? rasterDomain : choroplethDomain;
  const units  = isGrid
    ? (display.legendUnits ?? display.units)
    : display.units;

  function fmt(v) {
    if (v == null) return '';
    return Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1);
  }

  return (
    <div className="legend">
      <div className="legend-header">
        <span className="legend-title">{display.legendTitle}</span>
        <span className="legend-mode-badge">
          {isGrid ? 'Grid' : 'Choropleth'}
        </span>
      </div>
      <div className="legend-gradient" style={{ background: GRADIENT }} />
      <div className="legend-ticks">
        <span>{domain ? fmt(domain.min) : '0'}</span>
        <span>{domain ? fmt(domain.max) : '—'}</span>
      </div>
      <div className="legend-units">{units}</div>
    </div>
  );
}