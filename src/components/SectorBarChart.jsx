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
  labelSector,
  hasUncertainty,
}                                  from '../utils/emissionsUtils';

// ─── Shared colour tokens (mirror TimeSeriesPlot) ─────────────────────────────
const DIM_COLOR    = '#99a7b9';
const BRIGHT_COLOR = '#e2e8f0';

// ─── Custom tooltip ───────────────────────────────────────────────────────────
// payload[0].payload is the full chartData row, which carries errorRange.
// We construct the three rows ourselves so Emissions always sits in the middle.

function SectorBarCustomTooltip({ active, payload, label, units, accent, showUncertainty }) {
  if (!active || !payload?.length) return null;

  const entry      = payload[0];
  const val        = entry?.value;
  const errorRange = entry?.payload?.errorRange;   // [min, max] or null

  const rows = showUncertainty && errorRange
    ? [
        { name: 'Upper bound', value: errorRange[1], dimmed: true  },
        { name: 'Emissions',   value: val,           dimmed: false },
        { name: 'Lower bound', value: errorRange[0], dimmed: true  },
      ]
    : [
        { name: 'Emissions', value: val, dimmed: false },
      ];

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

      {rows.map((row) => {
        const color = row.dimmed ? DIM_COLOR : BRIGHT_COLOR;
        return (
          <div
            key={row.name}
            style={{ color, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}
          >
            <span style={{ opacity: row.dimmed ? 0.75 : 1 }}>{row.name}</span>
            <span style={{ fontWeight: row.dimmed ? 400 : 600 }}>
              {row.value != null ? Number(row.value).toFixed(3) : 'N/A'}
              {units && (
                <span style={{ opacity: 0.6, fontSize: '0.68rem', marginLeft: '0.2rem' }}>
                  {units}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── SectorBarChart ───────────────────────────────────────────────────────────

export function SectorBarChart() {
  const { activeDataset, activeFamily, controls, selectedState } = useDatasetContext();
  const { data: baseData, loading } = useEmissionData();

  if (!baseData) return null;

  const mode       = selectedState ? 'state' : 'national';
  const placeLabel = selectedState ?? 'National';

  const barData = buildBarData(baseData, {
    year:          controls.year,
    mode,
    satellite:     controls.satellite,
    selectedState,
  });

  if (!barData.labels.length) return null;

  const showUncertainty = hasUncertainty(controls.satellite);
  const accent          = activeFamily.theme.accent;

  const chartData = barData.labels.map((key, i) => ({
    sector:     labelSector(key),
    value:      barData.values[i],
    errorRange: showUncertainty && barData.mins[i] != null
      ? [barData.mins[i], barData.maxs[i]]
      : null,
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
              />
            }
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />

          <Bar dataKey="value" name="Emissions" radius={[0, 3, 3, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={accent} fillOpacity={0.85} />
            ))}
            {showUncertainty && (
              <ErrorBar
                dataKey="errorRange"
                width={4}
                strokeWidth={1.5}
                stroke="#94a3b8"
                direction="x"
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}