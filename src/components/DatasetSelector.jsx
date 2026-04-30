import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';

export function DatasetSelector() {
  // datasetsInActiveFamily replaces allDatasets — filtered automatically
  const { activeDataset, datasetsInActiveFamily, setActiveDataset } = useDatasetContext();

  return (
    <div className="dataset-selector">
      <span className="selector-label">Region</span>
      <div className="selector-tabs">
        {datasetsInActiveFamily.map(ds => (
          <button
            key={ds.id}
            className={`selector-tab ${ds.id === activeDataset.id ? 'active' : ''}`}
            onClick={() => setActiveDataset(ds.id)}
            title={ds.description}
          >
            {ds.name}
          </button>
        ))}
      </div>
    </div>
  );
}