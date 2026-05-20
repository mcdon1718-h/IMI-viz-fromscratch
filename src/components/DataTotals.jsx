import React, { useMemo } from 'react';
import { useDatasetContext } from '../context/DatasetContext';
import { useEmissionData }   from '../hooks/useEmissionData';
import { parseNumber }       from '../utils/emissionsUtils';

const SUPPORTED = new Set(['ch4-conus', 'ch4-colombia']);

export function DataTotals() {
  const { activeDataset, controls, selectedState } = useDatasetContext();
  const { data: baseData } = useEmissionData();

  const { year, satellite } = controls;
  const isState = !!selectedState;

  const { totalPost, anthroPost } = useMemo(() => {
    const empty = { totalPost: null, anthroPost: null };
    if (!SUPPORTED.has(activeDataset.id) || !baseData) return empty;

    // ── Colombia ────────────────────────────────────────────────────────────
    // All Colombia sectors are anthropogenic (no wetlands), so total = anthro
    if (activeDataset.id === 'ch4-colombia') {
      if (!isState) {
        const row = baseData.nationalPosterior?.[year];
        const v   = parseNumber(row?.TotalAnth);
        return { totalPost: v, anthroPost: v };
      }
      const row = baseData.byYear?.[year]?.[selectedState];
      const v   = parseNumber(row?.TotalAnth_posterior);
      return { totalPost: v, anthroPost: v };
    }

    // ── CONUS national ──────────────────────────────────────────────────────
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

    // ── CONUS state ─────────────────────────────────────────────────────────
    const { sectorKeys } = baseData;
    if (!sectorKeys?.length) return empty;

    const row = satellite === 'ghgi'
      ? baseData.stateByYearPrior?.[year]?.[selectedState]
      : baseData.byYear?.[year]?.[selectedState];
    if (!row) return empty;

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

  if (!SUPPORTED.has(activeDataset.id) || !baseData) return null;

  const units      = activeDataset.display.units;
  const fmt        = v => (v != null && Number.isFinite(v)) ? v.toFixed(2) : '—';

  const placeLabel = selectedState
    ? selectedState.toUpperCase()
    : activeDataset.id === 'ch4-colombia' ? 'COLOMBIA' : 'NATIONAL';

  return (
    <div className="data-totals-panel">
      <div className="data-totals-place">{placeLabel}</div>

      <div className="data-totals-table">
        <div className="dtc-spacer" />
        <div className="dtc-header">Bottom-up</div>
        <div className="dtc-header">Posterior</div>

        <div className="dtc-label">Anthropogenic</div>
        <div className="dtc-num dtc-dim">—</div>
        <div className="dtc-num dtc-accent">
          {fmt(anthroPost)}
          {anthroPost != null && <span className="dtc-units"> {units}</span>}
        </div>

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