import React from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useDatasetContext } from '../context/DatasetContext';
import { useEmissionData }   from '../hooks/useEmissionData';

export function MapView() {
  const { activeDataset }          = useDatasetContext();
  const { data, loading, error }   = useEmissionData();
  const { mapConfig, display }     = activeDataset;
  const { initialViewState: ivs }  = mapConfig;

  function styleFeature(feature) {
    const value = feature.properties?.value ?? 0;
    return {
      fillColor:   getColor(value, display.colorScale.stops),
      fillOpacity: 0.85,
      color:       'rgba(0,0,0,0.1)',
      weight:      0.5,
    };
  }

  return (
    <div className="map-wrapper">
      {/* key forces full re-mount when switching between datasets */}
      <MapContainer
        key={activeDataset.id}
        center={[ivs.latitude, ivs.longitude]}
        zoom={ivs.zoom}
        minZoom={mapConfig.minZoom}
        maxZoom={mapConfig.maxZoom}
        maxBounds={mapConfig.maxBounds}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {data && data.features.length > 0 && (
          <GeoJSON
            key={`${activeDataset.id}-data`}
            data={data}
            style={styleFeature}
          />
        )}
      </MapContainer>

      {loading && <div className="map-overlay loading">Loading data…</div>}
      {error   && <div className="map-overlay error">⚠ {error}</div>}
    </div>
  );
}

// ─── Color helper ─────────────────────────────────────────────────────────────
// Walks the stops array and returns the color for the highest matching threshold

function getColor(value, stops) {
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);
  let color = sorted[0][1];
  for (const [stop, c] of sorted) {
    if (value >= stop) color = c;
    else break;
  }
  return color;
}