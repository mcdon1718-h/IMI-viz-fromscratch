import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';
import { FamilySelector }   from './FamilySelector';
import { DatasetSelector }  from './DatasetSelector';
import { ControlPanel }     from './ControlPanel';
import { MapView }          from './MapView';
import { Legend }           from './Legend';

export function Dashboard() {
  const { activeDataset, activeFamily } = useDatasetContext();

  return (
    <div className="dashboard" data-family={activeFamily.id}>

      <header className="dashboard-header">
        <h1 className="dashboard-title">Emissions Dashboard</h1>
        <FamilySelector />
      </header>

      <div className="dashboard-body">
        <aside className="dashboard-sidebar">

          <div className="dataset-info">
            <span className="dataset-family-badge">{activeFamily.label}</span>
            <h2>{activeDataset.name}</h2>
            <p>{activeDataset.description}</p>
          </div>

          <DatasetSelector />
          <ControlPanel />
          <Legend />

        </aside>

        <main className="dashboard-main">
          <MapView />
        </main>
      </div>

    </div>
  );
}