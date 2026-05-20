import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
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

function buildPixelColorFn(domainMin, domainMax, stops) {
  const range = (domainMax - domainMin) || 1;
  return (values) => {
    let v = values[0];

    // Treat missing / NaN pixels as zero so they receive the zero-color
    if (v == null || Number.isNaN(v)) v = 0;

    const t = (v - domainMin) / range;
    return stopsToColor(t, stops);
  };
}

// ─── Grid value lookup ────────────────────────────────────────────────────────
// Converts a lat/lng to the pixel row/col in the georaster and returns
// the raw band-0 value, or null if outside bounds / nodata / zero.

function getValueAtLatLng(gr, lat, lng) {
  if (!gr?.values) return null;
  const {
    xmin, xmax, ymin, ymax,
    pixelWidth, pixelHeight,
    values, noDataValue,
    width, height,
  } = gr;

  if (lng < xmin || lng > xmax || lat < ymin || lat > ymax) return null;

  const col = Math.floor((lng - xmin) / pixelWidth);
  const row = Math.floor((ymax - lat) / pixelHeight);

  if (row < 0 || row >= height || col < 0 || col >= width) return null;

  const val = values[0]?.[row]?.[col];
  if (val == null)                                       return null;
  if (noDataValue != null && val === noDataValue)        return null;
  if (!Number.isFinite(val) || val <= 0)                 return null;

  return val;
}

// ─── GridHoverLayer ───────────────────────────────────────────────────────────
// Lives inside <MapContainer>. Listens to Leaflet mousemove, looks up the
// pixel value, and portals a tooltip div into the map container element.

function GridHoverLayer({ georaster, units }) {
  const map = useMap();
  const [hover, setHover] = useState(null); // { point: {x,y}, value } | null

  useMapEvents({
    mousemove(e) {
      if (!georaster) { setHover(null); return; }
      const val = getValueAtLatLng(georaster, e.latlng.lat, e.latlng.lng);
      setHover(val != null ? { point: e.containerPoint, value: val } : null);
    },
    mouseout()  { setHover(null); },
    dragstart() { setHover(null); },
  });

  if (!hover) return null;

  // .leaflet-container has position:relative, so containerPoint coords work
  return createPortal(
    <div
      className="grid-hover-tooltip"
      style={{ left: hover.point.x + 14, top: hover.point.y }}
    >
      {hover.value.toFixed(3)}
      {units && <span className="grid-hover-units"> {units}</span>}
    </div>,
    map.getContainer(),
  );
}

// ─── RasterLayer ─────────────────────────────────────────────────────────────

function RasterLayer({ tifUrl, domainMin, domainMax, colorStops, opacity, onGeoRasterReady }) {
  const map = useMap();

  const [georaster, setGeoraster] = useState(null);
  const layerRef = useRef(null);

  const displayRef = useRef({ domainMin, domainMax, colorStops, opacity });
  displayRef.current = { domainMin, domainMax, colorStops, opacity };

  // ── Effect 1: fetch + parse TIF ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    fetch(tifUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${tifUrl}`);
        return r.arrayBuffer();
      })
      .then(buf  => parseGeoraster(buf))
      .then(gr   => {
        if (!cancelled) {
          setGeoraster(gr);
          onGeoRasterReady?.(gr);   // ← hand the parsed raster up to MapView
        }
      })
      .catch(err => {
        if (!cancelled) console.error('[RasterLayer] load error:', err.message);
      });

    return () => {
      cancelled = true;
      onGeoRasterReady?.(null);     // ← clear on unmount / url change
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tifUrl]);

  // ── Effect 2: create Leaflet layer once georaster is in state ─────────────
  useEffect(() => {
    if (!georaster) return undefined;

    const { domainMin: dMin, domainMax: dMax, colorStops: cs, opacity: op } =
      displayRef.current;

    const RASTER_PANE = 'rasterPane';
    try {
      if (!map.getPane(RASTER_PANE)) {
        map.createPane(RASTER_PANE);
        const p = map.getPane(RASTER_PANE);
        if (p && p.style) {
          p.style.zIndex = 650;
          p.style.pointerEvents = 'none';
        }
      }
    } catch (e) { /* ignore */ }

    if (layerRef.current) {
      try {
        map.removeLayer(layerRef.current);
      } catch (e) {
        if (typeof layerRef.current.remove === 'function') {
          try { layerRef.current.remove(); } catch (_) { /* ignore */ }
        }
      }
      layerRef.current = null;
    }

    try {
      map.eachLayer((l) => {
        if (!l || l === layerRef.current) return;
        const isGeoRaster   = !!l.__isGeoRaster;
        const hasPixelFn    = !!(l.options && l.options.pixelValuesToColorFn);
        const inRasterPane  = l.options && l.options.pane === 'rasterPane';
        const hasBaseUrl    = !!(l.options && (l.options.url || l._url));
        if ((isGeoRaster || hasPixelFn || inRasterPane) && !hasBaseUrl) {
          try { map.removeLayer(l); } catch (_) { }
        }
      });
    } catch (e) { /* ignore */ }

    const layer = new GeoRasterLayer({
      georaster,
      opacity:              op,
      pixelValuesToColorFn: buildPixelColorFn(dMin, dMax, cs),
      resolution:           256,
      pane:                 RASTER_PANE,
      caching:              false,
    });

    try { layer.__isGeoRaster = true; } catch (e) { /* ignore */ }
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      try {
        if (map && layer) map.removeLayer(layer);
      } catch (e) {
        if (typeof layer?.remove === 'function') {
          try { layer.remove(); } catch (_) { /* ignore */ }
        }
      }

      try {
        const pane = map.getPane && map.getPane('rasterPane');
        if (pane) {
          while (pane.firstChild) pane.removeChild(pane.firstChild);
        }
      } catch (e) { /* ignore */ }

      try {
        map.eachLayer((l) => {
          if (!l) return;
          const hasBaseUrl   = !!(l.options && (l.options.url || l._url));
          const isFlagged    = !!l.__isGeoRaster;
          const inRasterPane = l.options && l.options.pane === 'rasterPane';
          const hasPixelFn   = !!(l.options && l.options.pixelValuesToColorFn);
          if ((isFlagged || inRasterPane || hasPixelFn) && !hasBaseUrl) {
            try { map.removeLayer(l); } catch (_) { }
          }
        });
      } catch (e) { /* ignore */ }

      if (layerRef.current === layer) layerRef.current = null;
    };
  }, [georaster, map]);

  // ── Effect 3: re-color when domain changes ────────────────────────────────
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.options.pixelValuesToColorFn =
      buildPixelColorFn(domainMin, domainMax, colorStops);
    layerRef.current.redraw();
  }, [domainMin, domainMax, colorStops]);

  // ── Effect 4: update opacity in-place ────────────────────────────────────
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

// ─── StateBorderLayer ─────────────────────────────────────────────────────────

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

  const isGridMode = controls.viewMode === 'grid';

  // ── Parsed georaster from the active TIF, forwarded by RasterLayer ────────
  const [activeGeoRaster, setActiveGeoRaster] = useState(null);

  // ── TIF URL ───────────────────────────────────────────────────────────────
  const tifUrl = useMemo(() => {
    if (!baseData?.manifest || !isGridMode) return null;
    const entry = getManifestEntry(
      baseData.manifest,
      controls.sector,
      controls.year,
      controls.satellite,
    );
    return entry?.tif ? resolveTifUrl(dataRoot ?? '', entry.tif) : null;
  }, [
    baseData?.manifest,
    controls.viewMode,
    controls.sector,
    controls.year,
    controls.satellite,
    dataRoot,
  ]);

  // ── Raster domain ─────────────────────────────────────────────────────────
  const rasterDomain = useMemo(() => {
    if (!baseData?.manifest || !isGridMode) return { min: 0, max: 1 };
    const g = getGlobalDomain(baseData.manifest, controls.sector);
    return { min: 0, max: g.max * (controls.maxEmission ?? 1.0) };
  }, [
    baseData?.manifest,
    controls.viewMode,
    controls.sector,
    controls.maxEmission,
  ]);

  // ── Choropleth domain ─────────────────────────────────────────────────────
  const choroplethDomain = useMemo(() => {
    if (isGridMode || !baseData) return { min: 0, max: 10 };
    return computeChoroplethDomain(
      baseData, controls.year, controls.satellite, controls.sector,
    );
  }, [baseData, controls.viewMode, controls.year, controls.satellite, controls.sector]);

  // ── Column key for choropleth state lookup ────────────────────────────────
  const colKey = useMemo(
    () => centralCol(controls.sector, 'state', controls.satellite),
    [controls.sector, controls.satellite],
  );

  // ── State-level data for the selected year ────────────────────────────────
  const stateDataMap = useMemo(
    () => baseData?.byYear?.[controls.year] ?? {},
    [baseData, controls.year],
  );

  // ── State click handler ───────────────────────────────────────────────────
  const handleStateClick = useCallback(
    (name) => setSelectedState(selectedState === name ? null : name),
    [selectedState, setSelectedState],
  );

  const { initialViewState, maxBounds, minZoom = 2, maxZoom = 12 } = mapConfig;

  return (
    <div className="map-wrapper">

      {loading && (
        <div className="map-overlay loading">Loading data…</div>
      )}
      {!loading && error && (
        <div className="map-overlay error">Error: {error}</div>
      )}
      {!loading && !error && !selectedState && (
        <div className="map-overlay hint">Click a state to view state-level data</div>
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

        {/* ── Grid hover tooltip — only mounted in grid mode ───────────── */}
        {isGridMode && (
          <GridHoverLayer
            georaster={activeGeoRaster}
            units={display.legendUnits ?? display.units}
          />
        )}

        {/* ── Choropleth mode ──────────────────────────────────────────── */}
        {!isGridMode && baseData?.statesGeoJSON && (
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

        {/* ── Grid mode — raster TIF ───────────────────────────────────── */}
        {isGridMode && tifUrl && (
          <RasterLayer
            key={tifUrl}
            tifUrl={tifUrl}
            domainMin={rasterDomain.min}
            domainMax={rasterDomain.max}
            colorStops={colorStops}
            opacity={controls.opacity ?? 0.7}
            onGeoRasterReady={setActiveGeoRaster}
          />
        )}

        {/* ── State borders (grid mode) — click-to-select ──────────────── */}
        {isGridMode && baseData?.statesGeoJSON && (
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