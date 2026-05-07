import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import parseGeoraster        from 'georaster';
import GeoRasterLayer        from 'georaster-layer-for-leaflet';
import { useDatasetContext } from '../context/DatasetContext';
import { useEmissionData }   from '../hooks/useEmissionData';
import {
  getManifestEntry,
  getGlobalDomain,
  resolveTifUrl,
} from '../utils/manifestUtils';
import {
  computeChoroplethDomain,
  centralCol,
  parseNumber,
} from '../utils/emissionsUtils';

// ─── Color utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [0, 0, 0];
}

/**
 * Interpolate across a stop array.
 * stops: [[t0, '#rrggbb'], [t1, '#rrggbb'], …]  where t values are 0–1.
 */
function stopsToColor(t, stops) {
  if (!stops?.length) return 'rgba(128,128,128,1)';
  const c = Math.max(0, Math.min(1, t));
  if (c <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (c >= last[0]) return last[1];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (c >= t0 && c <= t1) {
      const f    = (c - t0) / (t1 - t0);
      const rgb0 = hexToRgb(c0);
      const rgb1 = hexToRgb(c1);
      const r    = Math.round(rgb0[0] + f * (rgb1[0] - rgb0[0]));
      const g    = Math.round(rgb0[1] + f * (rgb1[1] - rgb0[1]));
      const b    = Math.round(rgb0[2] + f * (rgb1[2] - rgb0[2]));
      return `rgba(${r},${g},${b},1)`;
    }
  }
  return last[1];
}

/** Build the function GeoRasterLayer calls per pixel. */
function buildPixelColorFn(domainMin, domainMax, stops) {
  const range = (domainMax - domainMin) || 1;
  return (values) => {
    const v = values[0];
    if (v == null || v <= 0) return null; // transparent for 0 / no-data
    const t = (v - domainMin) / range;
    return stopsToColor(t, stops);
  };
}

// ─── RasterLayer ─────────────────────────────────────────────────────────────
//
// This component owns the GeoRasterLayer Leaflet object.  Three effects handle
// three independent concerns:
//
//   1. Load / swap the TIF whenever tifUrl changes.
//   2. THE FIX — update the color function and redraw tiles whenever the
//      numeric domain changes (e.g. the "Color Scale Max" slider).
//   3. Update opacity in-place (no tile redraw needed).

function RasterLayer({ tifUrl, domainMin, domainMax, colorStops, opacity }) {
  const map      = useMap();
  const layerRef = useRef(null);

  // A mutable ref always holding the latest color params.
  // Used inside the async TIF-load callback so that if props change mid-flight
  // the layer is still created with the most recent values.
  const paramsRef = useRef({ domainMin, domainMax, colorStops, opacity });
  paramsRef.current = { domainMin, domainMax, colorStops, opacity };

  // ── Effect 1: load TIF and create layer ───────────────────────────────────
  useEffect(() => {
    if (!tifUrl) return;

    let cancelled = false;

    // Remove previous layer synchronously so old tiles disappear immediately.
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    fetch(tifUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching TIF`);
        return r.arrayBuffer();
      })
      .then((buf) => parseGeoraster(buf))
      .then((georaster) => {
        if (cancelled) return;

        // Read from ref so we always colour with the *latest* slider values,
        // not the values captured when the fetch started.
        const {
          domainMin: dMin,
          domainMax: dMax,
          colorStops: cs,
          opacity:    op,
        } = paramsRef.current;

        const layer = new GeoRasterLayer({
          georaster,
          opacity:              op,
          pixelValuesToColorFn: buildPixelColorFn(dMin, dMax, cs),
          resolution:           256,
        });

        layer.addTo(map);
        layerRef.current = layer;
      })
      .catch((err) => {
        if (!cancelled) console.error('[RasterLayer] load error:', err);
      });

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  // Only re-run when the URL (or map instance) changes — not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tifUrl, map]);

  // ── Effect 2 (THE FIX): re-color tiles when domain changes ────────────────
  //
  // GeoRasterLayer reads `this.options.pixelValuesToColorFn` each time it
  // creates a tile.  Overwriting that option then calling redraw() forces all
  // existing tiles to be re-requested with the new color function — no TIF
  // re-download is needed.
  //
  // This fires whenever domainMin or domainMax change, which happens as soon
  // as the user moves the "Color Scale Max" slider (controls.maxEmission).
  useEffect(() => {
    if (!layerRef.current) return; // layer not yet created (TIF still loading)

    layerRef.current.options.pixelValuesToColorFn =
      buildPixelColorFn(domainMin, domainMax, colorStops);

    layerRef.current.redraw();

  // colorStops is a frozen config object that never changes within a session;
  // only the numeric domain needs to be in the dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainMin, domainMax]);

  // ── Effect 3: update opacity without a full tile redraw ───────────────────
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setOpacity(opacity);
  }, [opacity]);

  return null;
}

// ─── ChoroplethLayer ──────────────────────────────────────────────────────────

function ChoroplethLayer({
  geojson,
  stateDataMap,
  colKey,
  domain,
  colorStops,
  onStateClick,
}) {
  const styleFn = useCallback(
    (feature) => {
      const name =
        feature.properties?.name   ??
        feature.properties?.NAME   ??
        feature.properties?.NAME_1 ?? '';
      const row = stateDataMap?.[name];
      const val = row ? parseNumber(row[colKey]) : null;

      if (val == null || !Number.isFinite(val)) {
        return { fillColor: '#2a2a3a', fillOpacity: 0.5, color: '#444', weight: 0.6 };
      }
      const t = (val - domain.min) / ((domain.max - domain.min) || 1);
      return {
        fillColor:   stopsToColor(t, colorStops),
        fillOpacity: 0.8,
        color:       '#1a1a2e',
        weight:      0.6,
      };
    },
    [stateDataMap, colKey, domain, colorStops],
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      const name =
        feature.properties?.name   ??
        feature.properties?.NAME   ??
        feature.properties?.NAME_1 ?? '';
      const row = stateDataMap?.[name];
      const val = row ? parseNumber(row[colKey]) : null;

      layer.bindTooltip(
        `<strong>${name}</strong><br />${val != null ? val.toFixed(3) : 'N/A'}`,
        { sticky: true },
      );

      layer.on({
        click(e) {
          e.originalEvent?.stopPropagation?.();
          onStateClick(name);
        },
        mouseover(e) {
          e.target.setStyle({ weight: 2.5, color: '#fff', fillOpacity: 0.95 });
          e.target.bringToFront();
        },
        mouseout(e) {
          e.target.setStyle({ weight: 0.6, color: '#1a1a2e', fillOpacity: 0.8 });
        },
      });
    },
    [onStateClick, stateDataMap, colKey],
  );

  if (!geojson) return null;

  return (
    <GeoJSON
      data={geojson}
      style={styleFn}
      onEachFeature={onEachFeature}
    />
  );
}

// ─── StateBorderLayer (shown while a state is selected / grid mode) ───────────

function StateBorderLayer({ geojson, selectedState, onStateClick }) {
  const styleFn = useCallback(
    (feature) => {
      const name =
        feature.properties?.name   ??
        feature.properties?.NAME   ??
        feature.properties?.NAME_1 ?? '';
      return {
        fillColor:   'transparent',
        fillOpacity: 0,
        color:       name === selectedState ? '#ffffff' : 'rgba(255,255,255,0.25)',
        weight:      name === selectedState ? 2 : 0.5,
      };
    },
    [selectedState],
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      const name =
        feature.properties?.name   ??
        feature.properties?.NAME   ??
        feature.properties?.NAME_1 ?? '';
      layer.on({
        click(e) {
          e.originalEvent?.stopPropagation?.();
          onStateClick(name);
        },
      });
    },
    [onStateClick],
  );

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

// ─── MapView (exported) ───────────────────────────────────────────────────────

export function MapView() {
  const {
    activeDataset,
    controls,
    selectedState,
    setSelectedState,
  } = useDatasetContext();

  const { data: baseData, loading, error } = useEmissionData();

  const { mapConfig, display, dataRoot } = activeDataset;
  const colorStops = display.colorScale?.stops ?? [];

  // ── TIF URL ─────────────────────────────────────────────────────────────
  const tifUrl = useMemo(() => {
    if (!baseData?.manifest || !selectedState) return null;
    const entry = getManifestEntry(
      baseData.manifest,
      controls.sector,
      controls.year,
      controls.satellite,
    );
    return entry?.tif ? resolveTifUrl(dataRoot ?? '', entry.tif) : null;
  }, [
    baseData?.manifest,
    selectedState,
    controls.sector,
    controls.year,
    controls.satellite,
    dataRoot,
  ]);

  // ── Raster domain — note: maxEmission is the only reactive part ──────────
  const rasterDomain = useMemo(() => {
    if (!baseData?.manifest || !selectedState) return { min: 0, max: 1 };
    const g = getGlobalDomain(baseData.manifest, controls.sector);
    return { min: 0, max: g.max * (controls.maxEmission ?? 1.0) };
  }, [
    baseData?.manifest,
    selectedState,
    controls.sector,
    controls.maxEmission,   // ← slider change flows through here → domainMax changes
  ]);

  // ── Choropleth domain ────────────────────────────────────────────────────
  const choroplethDomain = useMemo(() => {
    if (selectedState || !baseData) return { min: 0, max: 10 };
    return computeChoroplethDomain(
      baseData, controls.year, controls.satellite, controls.sector,
    );
  }, [baseData, selectedState, controls.year, controls.satellite, controls.sector]);

  // ── Column key used to look up state emissions ───────────────────────────
  const colKey = useMemo(
    () => centralCol(controls.sector, 'state', controls.satellite),
    [controls.sector, controls.satellite],
  );

  // ── State-level data for the selected year ───────────────────────────────
  const stateDataMap = useMemo(
    () => baseData?.byYear?.[controls.year] ?? {},
    [baseData, controls.year],
  );

  // ── Interaction ──────────────────────────────────────────────────────────
  const handleStateClick = useCallback(
    (name) => setSelectedState(selectedState === name ? null : name),
    [selectedState, setSelectedState],
  );

  const handleClearSelection = useCallback(
    () => setSelectedState(null),
    [setSelectedState],
  );

  // ── Map bootstrap (read once; MapContainer props are initial-only) ────────
  const { initialViewState, maxBounds, minZoom = 2, maxZoom = 12 } = mapConfig;

  return (
    <div className="map-wrapper">

      {/* ── Status overlays ─────────────────────────────────────────────── */}
      {loading && (
        <div className="map-overlay loading">Loading data…</div>
      )}
      {!loading && error && (
        <div className="map-overlay error">Error: {error}</div>
      )}
      {!loading && !error && !selectedState && (
        <div className="map-overlay hint">Click a state to view grid data</div>
      )}

      {/* ── Back button (grid mode only) ─────────────────────────────────── */}
      {selectedState && (
        <button
          onClick={handleClearSelection}
          style={{
            position:     'absolute',
            top:          '1rem',
            left:         '1rem',
            zIndex:       1000,
            padding:      '.35rem .8rem',
            background:   'rgba(15,17,23,.88)',
            color:        '#f1f5f9',
            border:       '1px solid #2d3148',
            borderRadius: '6px',
            fontSize:     '.78rem',
            cursor:       'pointer',
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
        {/* Base tile layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* ── Choropleth (no state selected) ──────────────────────────────── */}
        {!selectedState && baseData?.statesGeoJSON && (
          <ChoroplethLayer
            // Key forces remount when the data selection changes so GeoJSON
            // style and tooltip callbacks are always fresh.
            key={`ch-${controls.year}-${controls.satellite}-${colKey}`}
            geojson={baseData.statesGeoJSON}
            stateDataMap={stateDataMap}
            colKey={colKey}
            domain={choroplethDomain}
            colorStops={colorStops}
            onStateClick={handleStateClick}
          />
        )}

        {/* ── Raster grid (state selected) ────────────────────────────────── */}
        {selectedState && tifUrl && (
          <RasterLayer
            // key=tifUrl: remount (→ re-download) only when the file changes.
            // For maxEmission changes the key is stable; Effect 2 handles it.
            key={tifUrl}
            tifUrl={tifUrl}
            domainMin={rasterDomain.min}
            domainMax={rasterDomain.max}   // ← changes when slider moves
            colorStops={colorStops}
            opacity={controls.opacity ?? 0.7}
          />
        )}

        {/* ── State border overlay (grid mode) ────────────────────────────── */}
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