import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap }        from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import parseGeoraster                                       from 'georaster';
import GeoRasterLayer                                       from 'georaster-layer-for-leaflet';
import { useDatasetContext }                                from '../context/DatasetContext';
import { useEmissionData }                                  from '../hooks/useEmissionData';
import { getManifestEntry, getGlobalDomain, resolveTifUrl } from '../utils/manifestUtils';
import {
  parseNumber,
  centralCol,
  computeChoroplethDomain,
} from '../utils/emissionsUtils';

// ─── TIF cache ────────────────────────────────────────────────────────────────
const tifCache = new Map();

// ─── YlOrRd colormap ─────────────────────────────────────────────────────────
const YLORRD = [
  [255, 255, 204],
  [255, 237, 160],
  [254, 217, 118],
  [254, 178,  76],
  [253, 141,  60],
  [252,  78,  42],
  [227,  26,  28],
  [189,   0,  38],
  [128,   0,  38],
];

function ylorrd(t) {
  const n  = YLORRD.length - 1;
  const i  = Math.min(Math.floor(t * n), n - 1);
  const f  = t * n - i;
  const c0 = YLORRD[i];
  const c1 = YLORRD[i + 1];
  return `rgb(${Math.round(c0[0] + f * (c1[0] - c0[0]))},${
               Math.round(c0[1] + f * (c1[1] - c0[1]))},${
               Math.round(c0[2] + f * (c1[2] - c0[2]))})`;
}

// ─── GeoRasterOverlay ─────────────────────────────────────────────────────────
function GeoRasterOverlay({ tifUrl, globalDomain, displayMax, opacity = 0.7 }) {
  const map          = useMap();
  const layerRef     = useRef(null);
  const georasterRef = useRef(null);

  // Refs so buildLayer always reads current prop values — no stale closures
  const displayMaxRef  = useRef(displayMax);
  const globalDomRef   = useRef(globalDomain);
  const opacityRef     = useRef(opacity);

  displayMaxRef.current = displayMax;
  globalDomRef.current  = globalDomain;
  opacityRef.current    = opacity;

  function removeLayer() {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
  }

  // Build a fresh layer from an already-parsed georaster (no fetch)
  function buildLayer(georaster) {
    removeLayer();
    layerRef.current = new GeoRasterLayer({
      georaster,
      opacity:    opacityRef.current,
      resolution: 256,
      pixelValuesToColorFn: (vals) => {
        const v = vals?.[0];
        if (v == null || isNaN(v) || v <= 0) return null;
        const min   = globalDomRef.current.min;
        const max   = displayMaxRef.current;
        const range = (max - min) || 1;
        return ylorrd(Math.max(0, Math.min(1, (v - min) / range)));
      },
    });
    layerRef.current.addTo(map);
  }

  // Effect 1: TIF URL changed — fetch or cache hit, then build
  useEffect(() => {
    if (!tifUrl) { removeLayer(); georasterRef.current = null; return; }
    let cancelled = false;

    async function load() {
      try {
        let georaster = tifCache.get(tifUrl);
        if (!georaster) {
          const resp = await fetch(tifUrl);
          if (!resp.ok) throw new Error(`TIF not found: ${tifUrl}`);
          georaster  = await parseGeoraster(await resp.arrayBuffer());
          tifCache.set(tifUrl, georaster);
        }
        if (cancelled) return;
        georasterRef.current = georaster;
        buildLayer(georaster);
      } catch (err) {
        console.error('[GeoRasterOverlay] failed:', err.message);
      }
    }

    load();
    return () => { cancelled = true; removeLayer(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tifUrl]);

  // Effect 2: displayMax changed — rebuild from cached georaster, no fetch
  useEffect(() => {
    if (georasterRef.current) buildLayer(georasterRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMax]);

  // Effect 3: opacity only — instant, no rebuild
  useEffect(() => {
    if (layerRef.current) layerRef.current.setOpacity(opacity);
  }, [opacity]);

  return null;
}

// ─── StatesLayer ──────────────────────────────────────────────────────────────
function StatesLayer({ geojson, selectedState, onStateClick, choroplethFn }) {

  const styleFeature = useCallback((feature) => {
    const name       = getStateName(feature);
    const isSelected = name === selectedState;

    let fillColor   = 'transparent';
    let fillOpacity = 0;

    if (choroplethFn) {
      const color = choroplethFn(name);
      if (color) { fillColor = color; fillOpacity = 0.75; }
    }

    return {
      fillColor,
      fillOpacity,
      color:  isSelected ? '#ffffff' : '#888',
      weight: isSelected ? 2.5 : 0.8,
    };
  }, [selectedState, choroplethFn]);

  const onEachFeature = useCallback((feature, layer) => {
    const name = getStateName(feature);
    layer.on({
      click:     () => onStateClick(name),
      mouseover: (e) => e.target.setStyle({ weight: 2, color: '#ccc' }),
      mouseout:  (e) => e.target.setStyle(styleFeature(feature)),
    });
  }, [styleFeature, onStateClick]);

  return (
    <GeoJSON
      key={`states-${selectedState}-${!!choroplethFn}`}
      data={geojson}
      style={styleFeature}
      onEachFeature={onEachFeature}
    />
  );
}

function getStateName(feature) {
  const p = feature?.properties ?? {};
  return p.name ?? p.NAME ?? p.STATE_NAME ?? null;
}

// ─── Main MapView ─────────────────────────────────────────────────────────────
export function MapView() {
  const {
    activeDataset,
    controls,
    selectedState,
    setSelectedState,
  } = useDatasetContext();

  const { data: baseData, loading, error } = useEmissionData();
  const { mapConfig }                       = activeDataset;
  const { initialViewState: ivs }           = mapConfig;

  const isChoropleth = selectedState === null;
  const isGrid       = selectedState !== null;

  // ── Raster setup ───────────────────────────────────────────────────────────
  const manifestEntry = baseData?.manifest
    ? getManifestEntry(baseData.manifest, controls.sector, controls.year, controls.satellite)
    : null;

  const globalDomain = baseData?.manifest
    ? getGlobalDomain(baseData.manifest, controls.sector)
    : { min: 0, max: 1 };

  const displayMax = globalDomain.max * (controls.maxEmission ?? 1.0);

  const tifUrl = (isGrid && manifestEntry)
    ? resolveTifUrl(activeDataset.dataRoot, manifestEntry.tif)
    : null;

  // ── Choropleth setup ───────────────────────────────────────────────────────
  const choroplethDomain = useMemo(() => {
    if (!isChoropleth || !baseData) return null;
    return computeChoroplethDomain(
      baseData, controls.year, controls.satellite, controls.sector
    );
  }, [isChoropleth, baseData, controls.year, controls.satellite, controls.sector]);

  const choroplethFn = useMemo(() => {
    if (!choroplethDomain || !baseData?.byYear) return null;
    const col          = centralCol(controls.sector, 'state', controls.satellite);
    const { min, max } = choroplethDomain;
    const range        = (max - min) || 1;
    return (stateName) => {
      const row = baseData.byYear[controls.year]?.[stateName];
      const v   = row ? parseNumber(row[col]) : null;
      if (v == null) return null;
      return ylorrd(Math.max(0, Math.min(1, (v - min) / range)));
    };
  }, [choroplethDomain, baseData, controls.year, controls.satellite, controls.sector]);

  const handleStateClick = useCallback((name) => {
    setSelectedState(name === selectedState ? null : name);
  }, [selectedState, setSelectedState]);

  return (
    <div className="map-wrapper">
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
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>'
        />

        {isGrid && tifUrl && (
          <GeoRasterOverlay
            key={tifUrl}
            tifUrl={tifUrl}
            globalDomain={globalDomain}
            displayMax={displayMax}
            opacity={controls.opacity ?? 0.7}
          />
        )}

        {baseData?.statesGeoJSON && (
          <StatesLayer
            geojson={baseData.statesGeoJSON}
            selectedState={selectedState}
            onStateClick={handleStateClick}
            choroplethFn={isChoropleth ? choroplethFn : null}
          />
        )}
      </MapContainer>

      {loading && <div className="map-overlay loading">Loading data…</div>}
      {error   && <div className="map-overlay error">⚠ {error}</div>}

      {!loading && baseData && (
        <div className="map-overlay hint">
          {isChoropleth
            ? 'Click a state for grid view & detailed charts'
            : `${selectedState} — click again to return to national view`}
        </div>
      )}
    </div>
  );
}