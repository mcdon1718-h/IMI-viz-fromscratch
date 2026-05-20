import React, { useMemo } from 'react';
import { useDatasetContext } from '../context/DatasetContext';
import { useEmissionData }   from '../hooks/useEmissionData';
import { parseNumber }       from '../utils/emissionsUtils';

export function DataTotals() {
  const { activeDataset, controls, selectedState } = useDatasetContext();
  const { data: baseData } = useEmissionData();

  const { year, satellite } = controls;
  const isState = !!selectedState;

  const { totalPost, anthroPost } = useMemo(() => {
    const empty = { totalPost: null, anthroPost: null };
    if (activeDataset.id !== 'ch4-conus' || !baseData) return empty;

    /* ── National: use pre-computed columns from the national CSV ──────── */
    if (!isState) {
      const row = satellite === 'ghgi'
        ? baseData.nationalPrior?.[year]
        : baseData.nationalPosterior?.[year];
      if (!row) return empty;
      return {
        totalPost:  parseNumber(row.Total_ExclSoilAbs),
        anthroPost: parseNumber(row.Anthropogenic),
      };
    }

    /* ── State: sum sector posterior/prior columns ─────────────────────── */
    const { sectorKeys } = baseData;
    if (!sectorKeys?.length) return empty;

    const row = satellite === 'ghgi'
      ? baseData.stateByYearPrior?.[year]?.[selectedState]
      : baseData.byYear?.[year]?.[selectedState];
    if (!row) return empty;

    // ghgi prior CSV uses bare keys; posterior CSV uses _posterior suffix
    const getVal = (s) => {
      const raw = satellite === 'ghgi' ? row[s] : row[`${s}_posterior`];
      const v   = parseNumber(raw);
      return v != null && Number.isFinite(v) ? v : null;
    };

    const available = sectorKeys.filter(s => getVal(s) != null);
    if (!available.length) return empty;

    return {
      totalPost:  available.reduce((acc, s) => acc + getVal(s), 0),
      anthroPost: available
        .filter(s => s !== 'Wetlands')
        .reduce((acc, s) => acc + getVal(s), 0),
    };
  }, [activeDataset.id, baseData, year, satellite, isState, selectedState]);

  // Only render for the ch4-conus dataset once data is loaded
  if (activeDataset.id !== 'ch4-conus' || !baseData) return null;

  const units      = activeDataset.display.units;
  const fmt        = (v) => (v != null && Number.isFinite(v)) ? v.toFixed(2) : '—';
  const placeLabel = (selectedState ?? 'National').toUpperCase();

  return (
    <div className="data-totals-panel">
      <div className="data-totals-place">{placeLabel}</div>

      <div className="data-totals-table">
        {/* Column headers */}
        <div className="dtc-spacer" />
        <div className="dtc-header">Bottom-up</div>
        <div className="dtc-header">Posterior</div>

        {/* Anthropogenic row */}
        <div className="dtc-label">Anthropogenic</div>
        <div className="dtc-num dtc-dim">—</div>
        <div className="dtc-num dtc-accent">
          {fmt(anthroPost)}
          {anthroPost != null && <span className="dtc-units"> {units}</span>}
        </div>

        {/* Total row */}
        <div className="dtc-label">Total</div>
        <div className="dtc-num dtc-dim">—</div>
        <div className="dtc-num dtc-accent">
          {fmt(totalPost)}
          {totalPost != null && <span className="dtc-units"> {units}</span>}
        </div>
      </div>
    </div>
  );
}