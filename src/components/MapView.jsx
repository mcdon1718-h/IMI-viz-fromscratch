import React, { useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useDatasetContext } from '../context/DatasetContext';
import { useEmissionData } from '../hooks/useEmissionData';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const SOURCE_ID = 'emissions';
const LAYER_ID  = 'emissions-fill';

export function MapView() {
  const { activeDataset } = useDatasetContext();
  const { data, loading, error } = useEmissionData();

  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const activeIdRef   = useRef(null); // track which dataset the map was built for

  // ── (Re-)initialize map when dataset changes ────────────────────────────────
  useEffect(() => {
    // Tear down old instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const { initialViewState: ivs, minZoom, maxZoom, maxBounds, mapStyle } = activeDataset.mapConfig;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style:     mapStyle,
      center:    [ivs.longitude, ivs.latitude],
      zoom:      ivs.zoom,
      minZoom,
      maxZoom,
      ...(maxBounds ? { maxBounds } : {}),
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;
    activeIdRef.current = activeDataset.id;

    return () => { map.remove(); mapRef.current = null; };
  }, [activeDataset.id]); // only re-init on dataset switch

  // ── Update data layer whenever data arrives ─────────────────────────────────
  const applyData = useCallback((map, geojson, colorScale) => {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
    map.addLayer({
      id:     LAYER_ID,
      type:   'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': buildColorExpression(colorScale),
        'fill-opacity': 0.85,
        'fill-outline-color': 'rgba(0,0,0,0.1)',
      },
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    if (map.isStyleLoaded()) {
      applyData(map, data, activeDataset.display.colorScale);
    } else {
      map.once('styledata', () => applyData(map, data, activeDataset.display.colorScale));
    }
  }, [data, activeDataset.display.colorScale, applyData]);

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map-container" />
      {loading && <div className="map-overlay loading">Loading data…</div>}
      {error   && <div className="map-overlay error">⚠ {error}</div>}
    </div>
  );
}

/** Convert { stops: [value, color], ... } config to a Mapbox step expression */
function buildColorExpression(colorScale) {
  const entries = Object.entries(colorScale.stops).sort(([a], [b]) => a - b);
  const expr = ['interpolate', ['linear'], ['get', 'value']];
  for (const [stop, color] of entries) {
    expr.push(Number(stop), color);
  }
  return expr;
}