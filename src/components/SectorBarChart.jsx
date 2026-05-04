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

      <ResponsiveContainer width="100%" height={220}>
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
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="sector"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={80}
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