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
import {
  buildBarData,
  buildBottomUpBarData,
  labelSector,
  hasUncertainty,
}                                  from '../utils/emissionsUtils';

const DIM_COLOR    = '#99a7b9';
const BRIGHT_COLOR = '#e2e8f0';
const TEAL_COLOR   = '#14b8a6';

function SectorBarCustomTooltip({
  active, payload, label, units, accent, showUncertainty, showBottomUp,
}) {
  if (!active || !payload?.length) return null;

  const postEntry = payload.find(p => p.dataKey === 'value');
  const buEntry   = payload.find(p => p.dataKey === 'bottomUpValue');

  const val        = postEntry?.value;
  const errorRange = postEntry?.payload?.errorRange;
  const buVal      = buEntry?.value;

  const rows = [];
  if (showUncertainty && errorRange) {
    rows.push({ name: 'Upper bound', value: errorRange[1], color: DIM_COLOR,    weight: 400 });
  }
  rows.push(          { name: 'Posterior',   value: val,           color: BRIGHT_COLOR, weight: 600 });
  if (showUncertainty && errorRange) {
    rows.push({ name: 'Lower bound', value: errorRange[0], color: DIM_COLOR,    weight: 400 });
  }
  if (showBottomUp && buVal != null) {
    rows.push({ name: 'Bottom-up',   value: buVal,         color: TEAL_COLOR,   weight: 600 });
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
          style={{ color: row.color, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}
        >
          <span>{row.name}</span>
          <span style={{ fontWeight: row.weight }}>
            {row.value != null ? Number(row.value).toFixed(3) : 'N/A'}
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
  const { activeDataset, activeFamily, controls, selectedState } = useDatasetContext();
  const { data: baseData, loading } = useEmissionData();

  if (!baseData) return null;

  const mode       = selectedState ? 'state' : 'national';
  const placeLabel = selectedState ?? 'National';

  const barData = buildBarData(baseData, {
    year:      controls.year,
    mode,
    satellite: controls.satellite,
    selectedState,
  });

  if (!barData.labels.length) return null;

  const showUncertainty = hasUncertainty(controls.satellite);
  // Bottom-up series only appears alongside the posterior (ghgi_tropomi, CONUS)
  const showBottomUp = controls.satellite === 'ghgi_tropomi' && activeDataset.id === 'ch4-conus';
  const accent       = activeFamily.theme.accent;

  const bottomUpData = showBottomUp
    ? buildBottomUpBarData(baseData, { year: controls.year, mode, selectedState })
    : null;

  const chartData = barData.labels.map((key, i) => ({
    sector:        labelSector(key),
    value:         barData.values[i],
    errorRange:    showUncertainty && barData.mins[i] != null
      ? [barData.mins[i], barData.maxs[i]]
      : null,
    errorDelta:    showUncertainty && barData.mins[i] != null && barData.values[i] != null
      ? [
          Math.max(0, barData.values[i] - barData.mins[i]),
          Math.max(0, barData.maxs[i]   - barData.values[i]),
        ]
      : null,
    bottomUpValue: showBottomUp ? (bottomUpData?.values[i] ?? null) : null,
  }));

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <span className="chart-title">Sector Breakdown</span>
        <span className="chart-place">{placeLabel}</span>
        <span className="chart-year">{controls.year}</span>
        <span className="chart-units">{activeDataset.display.units}</span>
        {loading && <span className="chart-status">Loading…</span>}
      </div>

      <ResponsiveContainer width="100%" height={320}>
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
                units={activeDataset.display.units}
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