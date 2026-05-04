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
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
          />
          <XAxis
            dataKey="year"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{
              background:   '#1a1d27',
              border:       '1px solid #2d3148',
              borderRadius: '6px',
              color:        '#f1f5f9',
              fontSize:     '0.75rem',
            }}
            formatter={(v) => [v != null ? v.toFixed(3) : 'N/A', activeDataset.display.units]}
            labelStyle={{ color: accent, fontWeight: 600 }}
          />

          {showUncertainty && (
            <>
              <Area
                type="monotone"
                dataKey="max"
                stroke="none"
                fill={accentDim}
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="min"
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
              fontSize: 10,
              position: 'top',
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}