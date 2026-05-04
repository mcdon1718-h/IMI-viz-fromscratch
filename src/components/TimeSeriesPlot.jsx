import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { useDatasetContext }  from '../context/DatasetContext';
import { useTimeSeriesData }  from '../hooks/useTimeSeriesData';

export function TimeSeriesPlot() {
  const { activeDataset, activeFamily, controls } = useDatasetContext();
  const { data, loading, error } = useTimeSeriesData();

  // Don't render at all if no timeSeries config or only one year available
  const yearControl    = activeDataset.controls.find(c => c.key === 'year');
  const hasMultiYears  = yearControl && yearControl.options.length > 1;
  if (!activeDataset.timeSeries || !hasMultiYears) return null;

  const { lines }  = activeDataset.timeSeries;
  const currentYear = controls.year;
  const accent      = activeFamily.theme.accent;

  return (
    <div className="timeseries-panel">

      <div className="timeseries-header">
        <span className="timeseries-title">Time Series</span>
        <span className="timeseries-units">{activeDataset.display.units}</span>
        {loading && <span className="timeseries-status">Loading…</span>}
        {error   && <span className="timeseries-status error">⚠ {error}</span>}
      </div>

      {data && (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
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
              labelStyle={{ color: accent, fontWeight: 600 }}
              cursor={{ stroke: accent, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '0.72rem', color: '#94a3b8', paddingTop: '4px' }}
            />

            {/* Vertical line marking the currently selected year */}
            <ReferenceLine
              x={currentYear}
              stroke={accent}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              label={{
                value:    currentYear,
                fill:     accent,
                fontSize: 10,
                position: 'top',
              }}
            />

            {lines.map(line => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 3, fill: line.color, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

    </div>
  );
}