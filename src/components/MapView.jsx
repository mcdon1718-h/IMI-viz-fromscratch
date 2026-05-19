import React, {
  useEffect, useState, useMemo, useCallback,
} from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import parseGeoraster     from 'georaster';
import GeoRasterLayer     from 'georaster-layer-for-leaflet';
import { useDatasetContext } from '../context/DatasetContext';
import { useEmissionData }   from '../hooks/useEmissionData';
import {
  getManifestEntry, getGlobalDomain, resolveTifUrl,
} from '../utils/manifestUtils';
import {
  computeChoroplethDomain, centralCol, parseNumber,
} from '../utils/emissionsUtils';

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [0,0,0];
}

function stopsToColor(t, stops) {
  if (!stops?.length) return null;
  const c = Math.max(0, Math.min(1, t));
  if (c <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (c >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (c >= t0 && c <= t1) {
      const f = (c - t0) / (t1 - t0);
      const [r0,g0,b0] = hexToRgb(c0);
      const [r1,g1,b1] = hexToRgb(c1);
      return `rgba(${Math.round(r0+f*(r1-r0))},${Math.round(g0+f*(g1-g0))},${Math.round(b0+f*(b1-b0))},1)`;
    }
  }
  return last[1];
}

// ─── RasterLayer ─────────────────────────────────────────────────────────────
//
// Receives a pre-parsed `georaster` object (no fetch here).
// All visual deps are in the effect's dependency array so any change
// triggers cleanup (removeLayer) + fresh layer with correct colorFn.
//
// THE FIX: after addTo, we reset _tileZoom and fire 'moveend' so Leaflet
// actually requests tiles for the current viewport.

function RasterLayer({ georaster, domainMin, domainMax, colorStops, opacity }) {
  const map = useMap();

  useEffect(() => {
    if (!georaster) return;

    const layer = new GeoRasterLayer({
      georaster,
      opacity,
      resolution: 256,
      pixelValuesToColorFn: (vals) => {
        const v = vals?.[0];
        if (v == null || isNaN(v) || v <= 0) return null;
        const range = (domainMax - domainMin) || 1;
        const t = Math.max(0, Math.min(1, (v - domainMin) / range));
        return stopsToColor(t, colorStops);
      },
    });

    layer.addTo(map);

    // ── THE FIX ──────────────────────────────────────────────────────────────
    // GridLayer.onAdd calls _resetView which sets _tileZoom to the current
    // zoom level. Any subsequent _resetView call sees no zoom change and
    // skips _update, so tiles never load. Clearing _tileZoom makes the next
    // _resetView think the zoom is "new" and calls _update unconditionally.
    // Firing 'moveend' is what actually triggers that _resetView call.
    layer._tileZoom = undefined;
    map.fire('moveend');
    // ─────────────────────────────────────────────────────────────────────────

    return () => {
      map.removeLayer(layer);
    };
  // All visual parameters in deps: any change = remove old layer + fresh one.
  // georaster change = new TIF; domain/opacity changes reuse same georaster.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georaster, domainMin, domainMax, colorStops, opacity, map]);

  return null;
}

// ─── ChoroplethLayer ──────────────────────────────────────────────────────────

function ChoroplethLayer({ geojson, stateDataMap, colKey, domain, colorStops, onStateClick }) {
  const styleFn = useCallback((feature) => {
    const name = feature.properties?.name ?? feature.properties?.NAME ?? feature.properties?.NAME_1 ?? '';
    const row  = stateDataMap?.[name];
    const val  = row ? parseNumber(row[colKey]) : null;
    if (val == null || !Number.isFinite(val)) {
      return { fillColor: '#2a2a3a', fillOpacity: 0.5, color: '#444', weight: 0.6 };
    }
    const t = (val - domain.min) / ((domain.max - domain.min) || 1);
    return { fillColor: stopsToColor(t, colorStops), fillOpacity: 0.8, color: '#1a1a2e', weight: 0.6 };
  }, [stateDataMap, colKey, domain, colorStops]);

  const onEachFeature = useCallback((feature, layer) => {
    const name = feature.properties?.name ?? feature.properties?.NAME ?? feature.properties?.NAME_1 ?? '';
    const row  = stateDataMap?.[name];
    const val  = row ? parseNumber(row[colKey]) : null;
    layer.bindTooltip(
      `<strong>${name}</strong><br />${val != null ? val.toFixed(3) : 'N/A'}`,
      { sticky: true },
    );
    layer.on({
      click(e)     { e.originalEvent?.stopPropagation?.(); onStateClick(name); },
      mouseover(e) { e.target.setStyle({ weight: 2.5, color: '#fff', fillOpacity: 0.95 }); e.target.bringToFront(); },
      mouseout(e)  { e.target.setStyle({ weight: 0.6, color: '#1a1a2e', fillOpacity: 0.8 }); },
    });
  }, [onStateClick, stateDataMap, colKey]);

  if (!geojson) return null;
  return <GeoJSON data={geojson} style={styleFn} onEachFeature={onEachFeature} />;
}

// ─── StateBorderLayer ─────────────────────────────────────────────────────────

function StateBorderLayer({ geojson, selectedState, onStateClick }) {
  const styleFn = useCallback((feature) => {
    const name = feature.properties?.name ?? feature.properties?.NAME ?? feature.properties?.NAME_1 ?? '';
    return {
      fillColor: 'transparent', fillOpacity: 0,
      color:  name === selectedState ? '#ffffff' : 'rgba(255,255,255,0.25)',
      weight: name === selectedState ? 2 : 0.5,
    };
  }, [selectedState]);

  const onEachFeature = useCallback((feature, layer) => {
    const name = feature.properties?.name ?? feature.properties?.NAME ?? feature.properties?.NAME_1 ?? '';
    layer.on({ click(e) { e.originalEvent?.stopPropagation?.(); onStateClick(name); } });
  }, [onStateClick]);

  if (!geojson) return null;
  return (
    <GeoJSON
      key={`borders-${selectedState}`}
      data={geojson}
      style={styleFn}
      onEachFeature={onEachFeature}
    />
  );
}

// ─── MapView ──────────────────────────────────────────────────────────────────

export function MapView() {
  const { activeDataset, controls, selectedState, setSelectedState } = useDatasetContext();
  const { data: baseData, loading, error } = useEmissionData();
  const { mapConfig, display, dataRoot } = activeDataset;
  const colorStops = display.colorScale?.stops ?? [];

  // ── TIF URL ──────────────────────────────────────────────────────────────
  const tifUrl = useMemo(() => {
    if (!baseData?.manifest || !selectedState) return null;
    const entry = getManifestEntry(
      baseData.manifest, controls.sector, controls.year, controls.satellite,
    );
    return entry?.tif ? resolveTifUrl(dataRoot ?? '', entry.tif) : null;
  }, [baseData?.manifest, selectedState, controls.sector, controls.year, controls.satellite, dataRoot]);

  // ── Georaster — fetched once per tifUrl, lives here across domain changes ──
  // Slider changes only affect domainMax; tifUrl stays the same, so this
  // state is untouched and RasterLayer never re-downloads the TIF.
  const [georaster, setGeoRaster] = useState(null);

  useEffect(() => {
    if (!tifUrl) { setGeoRaster(null); return; }
    let cancelled = false;
    setGeoRaster(null);
    fetch(tifUrl)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(parseGeoraster)
      .then(gr => { if (!cancelled) setGeoRaster(gr); })
      .catch(err => console.error('[MapView] TIF load error:', err));
    return () => { cancelled = true; };
  }, [tifUrl]);

  // ── Raster domain (changes when Color Scale Max slider moves) ─────────────
  const rasterDomain = useMemo(() => {
    if (!baseData?.manifest || !selectedState) return { min: 0, max: 1 };
    const g = getGlobalDomain(baseData.manifest, controls.sector);
    return { min: 0, max: g.max * (controls.maxEmission ?? 1.0) };
  }, [baseData?.manifest, selectedState, controls.sector, controls.maxEmission]);

  // ── Choropleth domain ─────────────────────────────────────────────────────
  const choroplethDomain = useMemo(() => {
    if (selectedState || !baseData) return { min: 0, max: 10 };
    return computeChoroplethDomain(baseData, controls.year, controls.satellite, controls.sector);
  }, [baseData, selectedState, controls.year, controls.satellite, controls.sector]);

  const colKey = useMemo(
    () => centralCol(controls.sector, 'state', controls.satellite),
    [controls.sector, controls.satellite],
  );

  const stateDataMap = useMemo(
    () => baseData?.byYear?.[controls.year] ?? {},
    [baseData, controls.year],
  );

  const handleStateClick     = useCallback((name) => setSelectedState(selectedState === name ? null : name), [selectedState, setSelectedState]);
  const handleClearSelection = useCallback(() => setSelectedState(null), [setSelectedState]);

  const { initialViewState, maxBounds, minZoom = 2, maxZoom = 12 } = mapConfig;

  return (
    <div className="map-wrapper">

      {loading && <div className="map-overlay loading">Loading data…</div>}
      {!loading && error && <div className="map-overlay error">Error: {error}</div>}
      {!loading && !error && !selectedState && (
        <div className="map-overlay hint">Click a state to view grid data</div>
      )}

      {selectedState && (
        <button
          onClick={handleClearSelection}
          style={{
            position: 'absolute', top: '1rem', left: '1rem', zIndex: 1000,
            padding: '.35rem .8rem', background: 'rgba(15,17,23,.88)',
            color: '#f1f5f9', border: '1px solid #2d3148', borderRadius: '6px',
            fontSize: '.78rem', cursor: 'pointer',
          }}
        >
          ← Overview
        </button>
      )}

      <MapContainer
        className="map-container"
        center={[initialViewState.latitude, initialViewState.longitude]}
        zoom={initialViewState.zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        maxBounds={maxBounds ?? undefined}
        maxBoundsViscosity={maxBounds ? 1.0 : 0}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {!selectedState && baseData?.statesGeoJSON && (
          <ChoroplethLayer
            key={`ch-${controls.year}-${controls.satellite}-${colKey}`}
            geojson={baseData.statesGeoJSON}
            stateDataMap={stateDataMap}
            colKey={colKey}
            domain={choroplethDomain}
            colorStops={colorStops}
            onStateClick={handleStateClick}
          />
        )}

        {selectedState && georaster && (
          <RasterLayer
            georaster={georaster}
            domainMin={rasterDomain.min}
            domainMax={rasterDomain.max}
            colorStops={colorStops}
            opacity={controls.opacity ?? 0.7}
          />
        )}

        {selectedState && baseData?.statesGeoJSON && (
          <StateBorderLayer
            geojson={baseData.statesGeoJSON}
            selectedState={selectedState}
            onStateClick={handleStateClick}
          />
        )}

      </MapContainer>
    </div>
  );
}