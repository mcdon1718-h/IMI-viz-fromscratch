import React from 'react';
import { DatasetProvider } from './context/DatasetContext';
import { Dashboard }       from './components/Dashboard';
import './App.css';

export default function App() {
  return (
    // initialFamilyId drives which family (and its first dataset) loads first.
    // Pass initialDatasetId instead to start on a specific dataset.
    <DatasetProvider initialFamilyId="CH4">
      <Dashboard />
    </DatasetProvider>
  );
}