import React from 'react'
import { DatasetProvider } from './context/DatasetContext'
import { Dashboard }       from './components/Dashboard'
import './App.css'

export default function App() {
  return (
    <DatasetProvider initialFamilyId="CH4">
      <Dashboard />
    </DatasetProvider>
  )
}