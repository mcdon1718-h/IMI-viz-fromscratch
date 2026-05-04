import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useDatasetContext } from '../context/DatasetContext';
import { useSectorData }     from '../hooks/useSectorData';

export function SectorBarChart() {
  const { activeDataset, activeFamily, controls } = useDatasetContext();
  const { data, loading, error } = useSectorData();

  if (!activeDataset.sectorBreakdown) return null;

  const emissionsColor = activeFamily.theme.accent;
  const satelliteColor = '#60a5fa';

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <span className="chart-title">Sector Breakdown</span>
        <span className="chart-year">{controls.year}</span>
        <span className="chart-units">{activeDataset.display.units}</span>
        {loading && <span className="chart-status">Loading…</span>}
        {error   && <span className="chart-status error">⚠ {error}</span>}
      </div>

      {data && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
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
              width={76}
            />
            <Tooltip
              contentStyle={{
                background:   '#1a1d27',
                border:       '1px solid #2d3148',
                borderRadius: '6px',
                color:        '#f1f5f9',
                fontSize:     '0.75rem',
              }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Legend
              wrapperStyle={{
                fontSize:   '0.72rem',
                color:      '#94a3b8',
                paddingTop: '6px',
              }}
            />
            <Bar
              dataKey="emissions"
              name="Emissions"
              fill={emissionsColor}
              radius={[0, 3, 3, 0]}
            />
            <Bar
              dataKey="satellite"
              name="Satellite"
              fill={satelliteColor}
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}