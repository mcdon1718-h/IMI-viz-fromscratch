import React, { useMemo }         from 'react';
import { useDatasetContext }       from '../context/DatasetContext';
import { useEmissionData }         from '../hooks/useEmissionData';
import { getGlobalDomain }         from '../utils/manifestUtils';
import { computeChoroplethDomain } from '../utils/emissionsUtils';

const GRADIENT = `linear-gradient(to right,
  #ffffcc, #ffeda0, #fed976, #feb24c,
  #fd8d3c, #fc4e2a, #e31a1c, #bd0026, #800026)`;

export function Legend() {
  const { activeDataset, controls, selectedState } = useDatasetContext();
  const { data: baseData }                         = useEmissionData();
  const { display }                                = activeDataset;

  const isChoropleth = selectedState === null;
  const isGrid       = selectedState !== null;

  const rasterDomain = useMemo(() => {
    if (!isGrid || !baseData?.manifest) return null;
    return getGlobalDomain(baseData.manifest, controls.sector);
  }, [isGrid, baseData, controls.sector]);

  const choroplethDomain = useMemo(() => {
    if (!isChoropleth || !baseData) return null;
    return computeChoroplethDomain(
      baseData, controls.year, controls.satellite, controls.sector
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