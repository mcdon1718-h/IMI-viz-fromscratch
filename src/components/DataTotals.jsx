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

  const { totalBottomUp, anthroBottomUp, totalPost, anthroPost } = useMemo(() => {
    const empty = { totalBottomUp: null, anthroBottomUp: null, totalPost: null, anthroPost: null };
    if (!SUPPORTED.has(activeDataset.id) || !baseData) return empty;

    // ── Colombia ─────────────────────────────────────────────────────────────
    // No bottom-up data yet; total = anthro (all sectors are anthropogenic)
    if (activeDataset.id === 'ch4-colombia') {
      const row = isState
        ? baseData.byYear?.[year]?.[selectedState]
        : baseData.nationalPosterior?.[year];
      const v = parseNumber(isState ? row?.TotalAnth_posterior : row?.TotalAnth);
      return { totalBottomUp: null, anthroBottomUp: null, totalPost: v, anthroPost: v };
    }

    // ── CONUS national ────────────────────────────────────────────────────────
    // Bottom-up is always GHGI prior (available for 2019–2020 only).
    // Posterior is only shown when satellite = ghgi_tropomi.
    if (!isState) {
      const priorRow = baseData.nationalPrior?.[year];
      const postRow  = satellite === 'ghgi_tropomi'
        ? baseData.nationalPosterior?.[year]
        : null;

      return {
        totalBottomUp:  priorRow ? parseNumber(priorRow.Total_ExclSoilAbs) : null,
        anthroBottomUp: priorRow ? parseNumber(priorRow.Anthropogenic)      : null,
        totalPost:      postRow  ? parseNumber(postRow.Total_ExclSoilAbs)   : null,
        anthroPost:     postRow  ? parseNumber(postRow.Anthropogenic)        : null,
      };
    }

    // ── CONUS state ───────────────────────────────────────────────────────────
    // sectorKeys includes 'Total_ExclSoilAbs' itself (it's a valid Sector-dropdown
    // choice), so it must be excluded from any component sum — otherwise it gets
    // added on top of the components it already aggregates, roughly doubling totals.
    const { sectorKeys } = baseData;
    if (!sectorKeys?.length) return empty;
    const componentKeys = sectorKeys.filter(s => s !== 'Total_ExclSoilAbs');

    // Bottom-up: bare sector keys in stateByYearPrior
    const priorRow = baseData.stateByYearPrior?.[year]?.[selectedState];
    const getBottomUp = (s) => {
      const v = parseNumber(priorRow?.[s]);
      return Number.isFinite(v) ? v : null;
    };
    const priorAvail = priorRow ? componentKeys.filter(s => getBottomUp(s) != null) : [];

    // Posterior: _posterior suffix in byYear (only when ghgi_tropomi)
    const postRow = satellite === 'ghgi_tropomi'
      ? baseData.byYear?.[year]?.[selectedState]
      : null;
    const getPost = (s) => {
      const v = parseNumber(postRow?.[`${s}_posterior`]);
      return Number.isFinite(v) ? v : null;
    };
    const postAvail = postRow ? componentKeys.filter(s => getPost(s) != null) : [];

    return {
      totalBottomUp:  priorRow ? parseNumber(priorRow.Total_ExclSoilAbs)           : null,
      totalPost:      postRow  ? parseNumber(postRow.Total_ExclSoilAbs_posterior) : null,
      anthroBottomUp: priorAvail.length
        ? priorAvail.filter(s => s !== 'Wetlands').reduce((acc, s) => acc + getBottomUp(s), 0)
        : null,
      anthroPost: postAvail.length
        ? postAvail.filter(s => s !== 'Wetlands').reduce((acc, s) => acc + getPost(s), 0)
        : null,
    };
  }, [activeDataset.id, baseData, year, satellite, isState, selectedState]);

  if (!SUPPORTED.has(activeDataset.id) || !baseData) return null;

  const units = activeDataset.display.units;
  const fmt   = v => (v != null && Number.isFinite(v)) ? v.toFixed(2) : '—';

  const placeLabel = selectedState
    ? selectedState.toUpperCase()
    : activeDataset.id === 'ch4-colombia' ? 'COLOMBIA' : 'NATIONAL';

  // Helper: render a number cell — accented if populated, dimmed if not
  function NumCell({ value }) {
    const populated = value != null && Number.isFinite(value);
    return (
      <div className={`dtc-num ${populated ? 'dtc-accent' : 'dtc-dim'}`}>
        {fmt(value)}
        {populated && <span className="dtc-units"> {units}</span>}
      </div>
    );
  }

  return (
    <div className="data-totals-panel">
      <div className="data-totals-place">{placeLabel}{' - '}{year}</div>

      <div className="data-totals-table">
        <div className="dtc-spacer" />
        <div className="dtc-header">Bottom-up</div>
        <div className="dtc-header">Posterior</div>

        <div className="dtc-label">Anthropogenic</div>
        <NumCell value={anthroBottomUp} />
        <NumCell value={anthroPost} />

        <div className="dtc-label">Total</div>
        <NumCell value={totalBottomUp} />
        <NumCell value={totalPost} />
      </div>
    </div>
  );
}