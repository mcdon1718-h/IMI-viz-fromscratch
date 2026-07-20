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
  buildBottomUpLineData,
  labelSector,
  hasUncertainty,
  activeYears,
}                                  from '../utils/emissionsUtils';

const DIM_COLOR    = '#99a7b9';
const BRIGHT_COLOR = '#e2e8f0';
const TEAL_COLOR   = '#14b8a6';

function TimeSeriesCustomTooltip({ active, payload, label, units, accent }) {
  if (!active || !payload?.length) return null;

  // Index by dataKey for reliable lookup regardless of render order
  const byKey = Object.fromEntries(payload.map(p => [p.dataKey, p]));

  const rows = [];
  if (byKey.max)
    rows.push({ name: 'Upper bound', value: byKey.max.value,     color: DIM_COLOR,    weight: 400 });
  if (byKey.value)
    rows.push({ name: 'Posterior',   value: byKey.value.value,   color: BRIGHT_COLOR, weight: 600 });
  if (byKey.min)
    rows.push({ name: 'Lower bound', value: byKey.min.value,     color: DIM_COLOR,    weight: 400 });
  if (byKey.bottomUp && byKey.bottomUp.value != null)
    rows.push({ name: 'Bottom-up',   value: byKey.bottomUp.value, color: TEAL_COLOR,  weight: 600 });

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
  const showBottomUp    = controls.satellite === 'ghgi_tropomi' && activeDataset.id === 'ch4-conus';
  const accent          = activeFamily.theme.accent;
  const accentDim       = activeFamily.theme.accentDim;

  const bottomUpLine = showBottomUp
    ? buildBottomUpLineData(baseData, {
        mode,
        sectorKey:     controls.sector,
        selectedState,
      })
    : null;

  const chartData = lineData.years.map((year, i) => ({
    year,
    value:    lineData.values[i],
    min:      lineData.mins[i],
    max:      lineData.maxs[i],
    // undefined (not null) when showBottomUp is false so Recharts ignores the key entirely
    ...(showBottomUp && { bottomUp: bottomUpLine?.values[i] ?? null }),
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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
              stroke:          accent,
              strokeOpacity:   0.4,
              strokeWidth:     1,
              strokeDasharray: '4 4',
            }}
          />

          {/* Uncertainty band */}
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

          {/* Posterior line */}
          <Line
            type="monotone"
            dataKey="value"
            name="Posterior"
            stroke={accent}
            strokeWidth={2}
            dot={{ r: 3, fill: accent, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />

          {/* Bottom-up line (teal, dashed) — ghgi_tropomi only */}
          {showBottomUp && (
            <Line
              type="monotone"
              dataKey="bottomUp"
              name="Bottom-up"
              stroke={TEAL_COLOR}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 3, fill: TEAL_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
            />
          )}

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