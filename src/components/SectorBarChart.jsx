import React                       from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ErrorBar,
  Cell,
}                                  from 'recharts';
import { useDatasetContext }        from '../context/DatasetContext';
import { useEmissionData }          from '../hooks/useEmissionData';
import { useDisplayUnit }           from '../hooks/useDisplayUnit';
import {
  buildBarData,
  buildBottomUpBarData,
  buildRangesBarData,
  buildRangesBottomUpBarData,
  labelSector,
  hasUncertainty,
}                                  from '../utils/emissionsUtils';
import { buildPeriodBarData }       from '../utils/manifestUtils';

const DIM_COLOR    = '#99a7b9';
const BRIGHT_COLOR = '#e2e8f0';
const TEAL_COLOR   = '#14b8a6';

// Manifest total_kg values are in the tens-of-millions for a whole-basin
// week; Gg (1e6 kg) keeps the axis/tooltip numbers readable.
const KG_TO_GG = 1e6;

function UploadBarTooltip({ active, payload, label, units, accent }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid #2d3148',
      borderRadius: '6px',
      padding:      '0.4rem 0.65rem',
      fontSize:     '0.85rem',
      lineHeight:   1.65,
      minWidth:     '9rem',
    }}>
      <div style={{ color: accent, fontWeight: 700, marginBottom: '0.15rem' }}>
        {label}
      </div>
      <div style={{ color: BRIGHT_COLOR, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <span>Total</span>
        <span style={{ fontWeight: 600 }}>
          {val != null ? Number(val).toFixed(3) : 'N/A'}
          {units && (
            <span style={{ opacity: 0.6, fontSize: '0.68rem', marginLeft: '0.2rem' }}>
              {units}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function SectorBarCustomTooltip({
  active, payload, label, units, accent, showUncertainty, showBottomUp,
}) {
  if (!active || !payload?.length) return null;

  const postEntry = payload.find(p => p.dataKey === 'value');
  const buEntry   = payload.find(p => p.dataKey === 'bottomUpValue');

  const val        = postEntry?.value;
  const errorRange = postEntry?.payload?.errorRange;
  const buVal      = buEntry?.value;

  // Same +/- convention as the map's grid-cell hover tooltip: the larger of
  // the two (possibly asymmetric) deltas around the central value, collapsed
  // to a single figure, rather than separate upper/lower bound rows.
  const spread = (showUncertainty && errorRange && val != null)
    ? Math.max(0, val - errorRange[0], errorRange[1] - val)
    : null;

  const rows = [
    { name: 'IMI Best Estimate', value: val, spread, color: BRIGHT_COLOR, weight: 600 },
  ];
  if (showBottomUp && buVal != null) {
    rows.push({ name: 'Bottom-up', value: buVal, color: TEAL_COLOR, weight: 600 });
  }

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid #2d3148',
      borderRadius: '6px',
      padding:      '0.4rem 0.65rem',
      fontSize:     '0.85rem',
      lineHeight:   1.65,
      minWidth:     '9rem',
    }}>
      <div style={{ color: accent, fontWeight: 700, marginBottom: '0.15rem' }}>
        {label}
      </div>
      {rows.map(row => (
        <div
          key={row.name}
          style={{ color: row.color, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}
        >
          <span style={{ whiteSpace: 'pre-line' }}>{row.name}</span>
          <span style={{ fontWeight: row.weight }}>
            {row.value != null ? Number(row.value).toFixed(3) : 'N/A'}
            {row.spread != null && (
              <span style={{ color: DIM_COLOR, fontWeight: 400, fontSize: '0.75rem' }}>
                {' ± '}{Number(row.spread).toFixed(3)}
              </span>
            )}
            {units && (
              <span style={{ opacity: 0.6, fontSize: '0.68rem', marginLeft: '0.2rem' }}>
                {units}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SectorBarChart() {
  const { activeDataset, activeFamily, controls, selectedState, uploadedData } = useDatasetContext();
  const { data: baseData, loading } = useEmissionData();
  const { label: displayUnits, convert } = useDisplayUnit();

  if (activeDataset.id === 'user-upload') {
    const sectors    = uploadedData?.sectors ?? {};
    const sectorKeys = Object.keys(sectors);
    if (sectorKeys.length < 2) return null; // nothing to compare with only one sector

    const accent = activeFamily.theme.accent;
    const units  = uploadedData?.meta?.units || '';

    const chartData = sectorKeys.map(key => ({
      sector: key,
      value:  sectors[key].sum ?? 0,
    }));

    return (
      <div className="chart-panel">
        <div className="chart-header">
          <span className="chart-title">Sector Breakdown</span>
          <span className="chart-units">{units}</span>
        </div>

        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#94a3b8', fontSize: 13 }}
              axisLine={{ stroke: '#2d3148' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sector"
              tick={{ fill: '#94a3b8', fontSize: 14 }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip
              content={<UploadBarTooltip units={units} accent={accent} />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="value" name="Total" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={accent} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (activeDataset.gridType === 'period') {
    if (!baseData?.manifest) return null;

    // Both sources are always shown here, independent of the Data Source
    // control (which only drives what's rendered on the map) — same
    // philosophy as ch4-global's DataTotals.
    const post = buildPeriodBarData(baseData.manifest, 'posterior', controls.period);
    const prior = buildPeriodBarData(baseData.manifest, 'prior', controls.period);
    if (!post.labels.length) return null;

    const accent    = activeFamily.theme.accent;
    const weekStart = baseData.manifest.periods?.find(p => p.key === String(controls.period))?.start;

    const chartData = post.labels.map((sector, i) => ({
      sector,
      value:         post.values[i]  != null ? convert(post.values[i]  / KG_TO_GG) : null,
      bottomUpValue: prior.values[i] != null ? convert(prior.values[i] / KG_TO_GG) : null,
    }));

    return (
      <div className="chart-panel">
        <div className="chart-header">
          <span className="chart-title">Sector Breakdown</span>
          <span className="chart-year">{weekStart}</span>
          <span className="chart-units">{displayUnits}</span>
        </div>

        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#94a3b8', fontSize: 13 }}
              axisLine={{ stroke: '#2d3148' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sector"
              tick={{ fill: '#94a3b8', fontSize: 14 }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip
              content={
                <SectorBarCustomTooltip
                  units={displayUnits}
                  accent={accent}
                  showUncertainty={false}
                  showBottomUp
                />
              }
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />

            <Bar dataKey="value" name="Posterior" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={accent} fillOpacity={0.85} />
              ))}
            </Bar>
            <Bar dataKey="bottomUpValue" name="Bottom-up" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={TEAL_COLOR} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (activeDataset.id === 'ch4-global') {
    if (!baseData?.sectorRanges) return null;

    const mode       = selectedState ? 'state' : 'national';
    const placeLabel = selectedState ?? (activeDataset.display?.defaultPlaceLabel ?? 'National');

    const rangesData = buildRangesBarData(baseData.sectorRanges, {
      selectedState,
      satellite: controls.satellite,
    });
    if (!rangesData.labels.length) return null;

    const showUncertainty = hasUncertainty(controls.satellite);
    const showBottomUp    = controls.satellite === 'posterior';
    const accent           = activeFamily.theme.accent;

    const bottomUpData = showBottomUp
      ? buildRangesBottomUpBarData(baseData.sectorRanges, { selectedState })
      : null;

    const chartData = rangesData.labels.map((key, i) => ({
      sector:        labelSector(key),
      value:         convert(rangesData.values[i]),
      errorRange:    showUncertainty && rangesData.mins[i] != null
        ? [convert(rangesData.mins[i]), convert(rangesData.maxs[i])]
        : null,
      errorDelta:    showUncertainty && rangesData.mins[i] != null && rangesData.values[i] != null
        ? [
            Math.max(0, convert(rangesData.values[i] - rangesData.mins[i])),
            Math.max(0, convert(rangesData.maxs[i]   - rangesData.values[i])),
          ]
        : null,
      bottomUpValue: showBottomUp ? convert(bottomUpData?.values[i] ?? null) : null,
    }));

    return (
      <div className="chart-panel">
        <div className="chart-header">
          <span className="chart-title">Sector Breakdown</span>
          <span className="chart-place">{placeLabel}</span>
          <span className="chart-year">{controls.year}</span>
          <span className="chart-units">{displayUnits}</span>
          {loading && <span className="chart-status">Loading…</span>}
        </div>

        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 4, right: showUncertainty ? 24 : 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fill: '#94a3b8', fontSize: 13 }}
              axisLine={{ stroke: '#2d3148' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sector"
              tick={{ fill: '#94a3b8', fontSize: 14 }}
              axisLine={false}
              tickLine={false}
              width={90}
            />

            <Tooltip
              content={
                <SectorBarCustomTooltip
                  units={displayUnits}
                  accent={accent}
                  showUncertainty={showUncertainty}
                  showBottomUp={showBottomUp}
                />
              }
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />

            {/* Posterior bars */}
            <Bar dataKey="value" name="Posterior" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={accent} fillOpacity={0.85} />
              ))}
              {showUncertainty && (
                <ErrorBar
                  dataKey="errorDelta"
                  width={4}
                  strokeWidth={1.5}
                  stroke="#94a3b8"
                  direction="x"
                />
              )}
            </Bar>

            {/* Bottom-up bars (teal) */}
            {showBottomUp && (
              <Bar dataKey="bottomUpValue" name="Bottom-up" radius={[0, 3, 3, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={TEAL_COLOR} fillOpacity={0.75} />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (!baseData) return null;

  const mode       = selectedState ? 'state' : 'national';
  const placeLabel = selectedState ?? (activeDataset.display?.defaultPlaceLabel ?? 'National');

  const barData = buildBarData(baseData, {
    year:      controls.year,
    mode,
    satellite: controls.satellite,
    selectedState,
  });

  if (!barData.labels.length) return null;

  const showUncertainty = hasUncertainty(controls.satellite);
  // Bottom-up series only appears alongside the posterior (CONUS & global)
  const showBottomUp = controls.satellite === 'posterior'
    && (activeDataset.id === 'ch4-conus' || activeDataset.id === 'ch4-global');
  const accent       = activeFamily.theme.accent;

  const bottomUpData = showBottomUp
    ? buildBottomUpBarData(baseData, { year: controls.year, mode, selectedState })
    : null;

  const chartData = barData.labels.map((key, i) => ({
    sector:        labelSector(key),
    value:         convert(barData.values[i]),
    errorRange:    showUncertainty && barData.mins[i] != null
      ? [convert(barData.mins[i]), convert(barData.maxs[i])]
      : null,
    errorDelta:    showUncertainty && barData.mins[i] != null && barData.values[i] != null
      ? [
          Math.max(0, convert(barData.values[i] - barData.mins[i])),
          Math.max(0, convert(barData.maxs[i]   - barData.values[i])),
        ]
      : null,
    bottomUpValue: showBottomUp ? convert(bottomUpData?.values[i] ?? null) : null,
  }));

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <span className="chart-title">Sector Breakdown</span>
        <span className="chart-place">{placeLabel}</span>
        <span className="chart-year">{controls.year}</span>
        <span className="chart-units">{displayUnits}</span>
        {loading && <span className="chart-status">Loading…</span>}
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: showUncertainty ? 24 : 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: '#94a3b8', fontSize: 13 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="sector"
            tick={{ fill: '#94a3b8', fontSize: 14 }}
            axisLine={false}
            tickLine={false}
            width={90}
          />

          <Tooltip
            content={
              <SectorBarCustomTooltip
                units={displayUnits}
                accent={accent}
                showUncertainty={showUncertainty}
                showBottomUp={showBottomUp}
              />
            }
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />

          {/* Posterior bars */}
          <Bar dataKey="value" name="Posterior" radius={[0, 3, 3, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={accent} fillOpacity={0.85} />
            ))}
            {showUncertainty && (
              <ErrorBar
                dataKey="errorDelta"
                width={4}
                strokeWidth={1.5}
                stroke="#94a3b8"
                direction="x"
              />
            )}
          </Bar>

          {/* Bottom-up bars (teal) — ghgi_tropomi only */}
          {showBottomUp && (
            <Bar dataKey="bottomUpValue" name="Bottom-up" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={TEAL_COLOR} fillOpacity={0.75} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}