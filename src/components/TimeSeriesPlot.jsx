import React                       from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
}                                  from 'recharts';
import { useDatasetContext }        from '../context/DatasetContext';
import { useEmissionData }          from '../hooks/useEmissionData';
import {
  buildLineData,
  labelSector,
  hasUncertainty,
  activeYears,
}                                  from '../utils/emissionsUtils';

// ─── Custom tooltip ───────────────────────────────────────────────────────────
// Recharts clones this element and injects active / payload / label as props.
// Entries at index 0 and 2 (the uncertainty bounds) get the dimmer colour;
// index 1 (the central value line) gets the bright colour.

const DIM_COLOR    = '#99a7b9';   // slate-500 — readable but clearly secondary
const BRIGHT_COLOR = '#e2e8f0';   // slate-200 — primary value

function TimeSeriesCustomTooltip({ active, payload, label, units, accent }) {
  if (!active || !payload?.length) return null;

  // Recharts emits payload in render order (max, min, value).
  // Re-sort so Emissions sits between the two uncertainty bounds.
  const RANK = { max: 0, value: 1, min: 2 };
  const orderedPayload = [...payload].sort(
    (a, b) => (RANK[a.dataKey] ?? 99) - (RANK[b.dataKey] ?? 99),
  );

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

      {orderedPayload.map((entry, i) => {
        const isDimmed = i === 0 || i === 2;
        const color    = isDimmed ? DIM_COLOR : BRIGHT_COLOR;
        const val      = entry.value;

        return (
          <div key={entry.dataKey} style={{ color, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <span style={{ opacity: isDimmed ? 0.75 : 1 }}>{entry.name}</span>
            <span style={{ fontWeight: isDimmed ? 400 : 600 }}>
              {val != null ? Number(val).toFixed(3) : 'N/A'}
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

// ─── TimeSeriesPlot ───────────────────────────────────────────────────────────

export function TimeSeriesPlot() {
  const { activeDataset, activeFamily, controls, selectedState } = useDatasetContext();
  const { data: baseData } = useEmissionData();

  const years = activeYears(controls.satellite);
  if (years.length < 2 || !baseData) return null;

  const mode       = selectedState ? 'state' : 'national';
  const placeLabel = selectedState ?? 'National';

  const lineData = buildLineData(baseData, {
    mode,
    sectorKey:     controls.sector,
    satellite:     controls.satellite,
    selectedState,
  });

  const showUncertainty = hasUncertainty(controls.satellite);
  const accent          = activeFamily.theme.accent;
  const accentDim       = activeFamily.theme.accentDim;

  const chartData = lineData.years.map((year, i) => ({
    year,
    value: lineData.values[i],
    min:   lineData.mins[i],
    max:   lineData.maxs[i],
  }));

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <span className="chart-title">Time Series</span>
        <span className="chart-place">{placeLabel}</span>
        <span className="chart-sector">{labelSector(controls.sector)}</span>
        <span className="chart-units">{activeDataset.display.units}</span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart
          data={chartData}
          margin={{ top: 22, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
          />
          <XAxis
            dataKey="year"
            tick={{ fill: '#94a3b8', fontSize: 13 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 13 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
            width={52}
          />

          <Tooltip
            content={
              <TimeSeriesCustomTooltip
                units={activeDataset.display.units}
                accent={accent}
              />
            }
            cursor={{
              stroke:        accent,
              strokeOpacity: 0.4,
              strokeWidth:   1,
              strokeDasharray: '4 4',
            }}
          />

          {showUncertainty && (
            <>
              <Area
                type="monotone"
                dataKey="max"
                name="Upper bound"
                stroke="none"
                fill={accentDim}
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="min"
                name="Lower bound"
                stroke="none"
                fill="#0f1117"
                legendType="none"
                isAnimationActive={false}
              />
            </>
          )}

          <Line
            type="monotone"
            dataKey="value"
            name="Emissions"
            stroke={accent}
            strokeWidth={2}
            dot={{ r: 3, fill: accent, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />

          <ReferenceLine
            x={controls.year}
            stroke={accent}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={{
              value:    controls.year,
              fill:     accent,
              fontSize: 12,
              position: 'top',
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}