import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';
import { FamilySelector }   from './FamilySelector';
import { DatasetSelector }  from './DatasetSelector';
import { ControlPanel }     from './ControlPanel';
import { DataTotals }       from './DataTotals';
import { UploadPanel }      from './UploadPanel';
import { MapView }          from './MapView';
import { Legend }           from './Legend';
import { SectorBarChart }   from './SectorBarChart';
import { TimeSeriesPlot }   from './TimeSeriesPlot';

export function Dashboard() {
  const { activeDataset, activeFamily, datasetsInActiveFamily, uploadedData } = useDatasetContext();

  const datasetTitle = activeDataset.id === 'user-upload'
    ? (uploadedData?.meta?.name || activeDataset.name)
    : activeDataset.name;

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

          <span className="dataset-family-badge">{activeFamily.label}</span>

          <p className="family-description">{activeFamily.description}</p>

          {/* Only one dataset in this family (e.g. uploads) — nothing to switch between */}
          {datasetsInActiveFamily.length > 1 && <DatasetSelector />}

          {/* Dataset title + description */}
          <div className="dataset-info">
            <h2>{datasetTitle}</h2>
            <p>{activeDataset.description}</p>
          </div>

          {/* ── Emissions totals summary ──────────────────────────────── */}
          <DataTotals />

          {activeDataset.id === 'user-upload' && <UploadPanel />}

          <ControlPanel />
          <Legend />
          <SectorBarChart />
          <TimeSeriesPlot />

        </aside>

        <main className="dashboard-main">
          <MapView />
        </main>

      </div>
    </div>
  );
}