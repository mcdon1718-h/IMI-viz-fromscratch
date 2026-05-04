import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';
import { FamilySelector }   from './FamilySelector';
import { DatasetSelector }  from './DatasetSelector';
import { ControlPanel }     from './ControlPanel';
import { MapView }          from './MapView';
import { Legend }           from './Legend';
import { SectorBarChart }   from './SectorBarChart';
import { TimeSeriesPlot }   from './TimeSeriesPlot';

export function Dashboard() {
  const { activeDataset, activeFamily } = useDatasetContext();

  return (
    <div className="dashboard" data-family={activeFamily.id}>

      <header className="dashboard-header">
        <h1 className="dashboard-title">{activeFamily.dashboardTitle}</h1>
        <FamilySelector />
      </header>

      {activeFamily.id === 'CO2' && (
        <div className="family-warning-banner">
          There is no IMI output data for CO₂ at this time.
        </div>
      )}

      <div className="dashboard-body">
        <aside className="dashboard-sidebar">

          {/* ── Top: identity + controls ───────────────────────────────── */}
          <div className="dataset-info">
            <span className="dataset-family-badge">{activeFamily.label}</span>
            <h2>{activeDataset.name}</h2>
            <p>{activeDataset.description}</p>
          </div>

          <DatasetSelector />
          <ControlPanel />
          <Legend />

          {/* ── Bottom: charts (only render when data configs exist) ───── */}
          <SectorBarChart />
          <TimeSeriesPlot />

        </aside>

        {/* Map takes full remaining height — no sharing with charts */}
        <main className="dashboard-main">
          <MapView />
        </main>

      </div>
    </div>
  );
}