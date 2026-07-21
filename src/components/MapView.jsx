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
import L                from 'leaflet';
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
import { rasterMax } from '../utils/gridStats';

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
    if (v == null || Number.isNaN(v)) v = 0;
    const t = (v - domainMin) / range;
    return stopsToColor(t, stops);
  };
}

// ─── Feature name helper ──────────────────────────────────────────────────────
// Handles US state GeoJSON (name / NAME / NAME_1) and Colombia province GeoJSON
// (PROVINCE / province) with a single priority-ordered lookup.

function getFeatureName(feature) {
  const p = feature?.properties ?? {};
  return p.name ?? p.NAME ?? p.NAME_1 ?? p.PROVINCE ?? p.province ?? '';
}

// ─── Grid value lookup (TIF) ──────────────────────────────────────────────────

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
  if (val == null)                                   return null;
  if (noDataValue != null && val === noDataValue)    return null;
  if (!Number.isFinite(val) || val <= 0)             return null;
  return val;
}

// ─── Grid value lookup (JSON / Colombia) ──────────────────────────────────────
// Nearest-neighbour search into the flat values array using the lat/lon metadata.

function getValueAtLatLngFromGrid(gridMeta, values, lat, lng) {
  if (!gridMeta?.lats?.length || !gridMeta?.lons?.length || !values?.length) return null;

  const { lats, lons } = gridMeta;
  const nlat = lats.length;
  const nlon = lons.length;
  const dlat = nlat > 1 ? Math.abs(Number(lats[1]) - Number(lats[0])) : 0.25;
  const dlon = nlon > 1 ? Math.abs(Number(lons[1]) - Number(lons[0])) : 0.25;

  // Find nearest lat row
  let latIdx = 0, minLatD = Infinity;
  for (let i = 0; i < nlat; i++) {
    const d = Math.abs(Number(lats[i]) - lat);
    if (d < minLatD) { minLatD = d; latIdx = i; }
  }
  if (minLatD > dlat / 2) return null;   // cursor outside grid

  // Find nearest lon column
  let lonIdx = 0, minLonD = Infinity;
  for (let j = 0; j < nlon; j++) {
    const d = Math.abs(Number(lons[j]) - lng);
    if (d < minLonD) { minLonD = d; lonIdx = j; }
  }
  if (minLonD > dlon / 2) return null;   // cursor outside grid

  const v = values[latIdx * nlon + lonIdx];
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

// ─── MapController ────────────────────────────────────────────────────────────
// React-Leaflet's MapContainer treats center / zoom / maxBounds as initial-only.
// This child component keeps the Leaflet instance in sync when the active dataset
// (and therefore mapConfig) changes.

function MapController({ mapConfig }) {
  const map = useMap();
  const { initialViewState, maxBounds, minZoom, maxZoom } = mapConfig;

  // Stable serialised key — bounds effect only re-fires when limits actually change
  const boundsKey = JSON.stringify({ maxBounds: maxBounds ?? null, minZoom, maxZoom });

  // Re-centre / re-zoom on dataset switch
  useEffect(() => {
    map.setView(
      [initialViewState.latitude, initialViewState.longitude],
      initialViewState.zoom,
      { animate: true, duration: 0.5 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, initialViewState.latitude, initialViewState.longitude, initialViewState.zoom]);

  // Sync pan bounds and zoom limits
  useEffect(() => {
    if (maxBounds) {
      map.setMaxBounds(maxBounds);
      map.options.maxBoundsViscosity = 1.0;
    } else {
      map.setMaxBounds(null);
      map.options.maxBoundsViscosity = 0;
    }
    if (minZoom != null) map.setMinZoom(minZoom);
    if (maxZoom != null) map.setMaxZoom(maxZoom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey]);

  return null;
}

// ─── GridHoverLayer (TIF mode) ────────────────────────────────────────────────

function GridHoverLayer({ georaster, minGeoraster, maxGeoraster, units }) {
  const map = useMap();
  const [hover, setHover] = useState(null);

  useMapEvents({
    mousemove(e) {
      if (!georaster) { setHover(null); return; }
      const val = getValueAtLatLng(georaster, e.latlng.lat, e.latlng.lng);
      if (val == null) { setHover(null); return; }
      const min = minGeoraster ? getValueAtLatLng(minGeoraster, e.latlng.lat, e.latlng.lng) : null;
      const max = maxGeoraster ? getValueAtLatLng(maxGeoraster, e.latlng.lat, e.latlng.lng) : null;
      setHover({ point: e.containerPoint, value: val, min, max });
    },
    mouseout()  { setHover(null); },
    dragstart() { setHover(null); },
  });

  if (!hover) return null;

  // Ensemble min/max only exist for posterior data -- when either is
  // unavailable (e.g. GHGI-prior, or this cell has no ensemble coverage)
  // the tooltip just falls back to showing the central value alone.
  const spread = (hover.min != null && hover.max != null)
    ? (hover.max - hover.min) / 2
    : null;

  return createPortal(
    <div
      className="grid-hover-tooltip"
      style={{ left: hover.point.x + 14, top: hover.point.y }}
    >
      {hover.value.toFixed(3)}
      {spread != null && <span className="grid-hover-spread"> ± {spread.toFixed(3)}</span>}
      {units && <span className="grid-hover-units"> {units}</span>}
    </div>,
    map.getContainer(),
  );
}

// ─── useGeoraster (fetch + parse only, no map layer) ──────────────────────────
// Used for the min/max ensemble rasters, which back the hover tooltip but are
// never drawn on the map themselves.

function useGeoraster(url) {
  const [georaster, setGeoraster] = useState(null);

  useEffect(() => {
    if (!url) { setGeoraster(null); return undefined; }
    let cancelled = false;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`); return r.arrayBuffer(); })
      .then(buf => parseGeoraster(buf))
      .then(gr  => { if (!cancelled) setGeoraster(gr); })
      .catch(err => { if (!cancelled) console.error('[useGeoraster] load error:', err.message); });
    return () => { cancelled = true; };
  }, [url]);

  return georaster;
}

// ─── useJsonMinMax (fetch only, Colombia hover uncertainty) ───────────────────
// Each uncertainty file holds a single { min: [...], max: [...] } pair of flat
// arrays aligned with gridMeta -- one fetch backs both bounds of the tooltip.

function useJsonMinMax(url) {
  const [minMax, setMinMax] = useState(null);

  useEffect(() => {
    if (!url) { setMinMax(null); return undefined; }
    let cancelled = false;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`); return r.json(); })
      .then(data => { if (!cancelled) setMinMax({ min: data.min ?? null, max: data.max ?? null }); })
      .catch(err => { if (!cancelled) console.error('[useJsonMinMax] load error:', err.message); });
    return () => { cancelled = true; };
  }, [url]);

  return minMax;
}

// ─── JsonGridHoverLayer ───────────────────────────────────────────────────────
// Same portal tooltip as GridHoverLayer but uses the flat JSON values array
// instead of a parsed georaster (the polygon layer is non-interactive).

function JsonGridHoverLayer({
  gridMeta, values, minValues, maxValues, units,
}) {
  const map = useMap();
  const [hover, setHover] = useState(null);

  useMapEvents({
    mousemove(e) {
      if (!gridMeta || !values) { setHover(null); return; }
      const val = getValueAtLatLngFromGrid(gridMeta, values, e.latlng.lat, e.latlng.lng);
      if (val == null) { setHover(null); return; }
      const min = minValues ? getValueAtLatLngFromGrid(gridMeta, minValues, e.latlng.lat, e.latlng.lng) : null;
      const max = maxValues ? getValueAtLatLngFromGrid(gridMeta, maxValues, e.latlng.lat, e.latlng.lng) : null;
      setHover({ point: e.containerPoint, value: val, min, max });
    },
    mouseout()  { setHover(null); },
    dragstart() { setHover(null); },
  });

  if (!hover) return null;

  // Ensemble min/max only exist for sectors/years with uncertainty coverage --
  // when either is unavailable the tooltip falls back to the central value alone.
  const spread = (hover.min != null && hover.max != null)
    ? (hover.max - hover.min) / 2
    : null;

  return createPortal(
    <div
      className="grid-hover-tooltip"
      style={{ left: hover.point.x + 14, top: hover.point.y }}
    >
      {hover.value.toFixed(3)}
      {spread != null && <span className="grid-hover-spread"> ± {spread.toFixed(3)}</span>}
      {units && <span className="grid-hover-units"> {units}</span>}
    </div>,
    map.getContainer(),
  );
}

// ─── RasterLayer (TIF / CONUS) ────────────────────────────────────────────────

function RasterLayer({
  tifUrl, domainMin, domainMax, colorStops, opacity, onGeoRasterReady, onRawMaxReady,
}) {
  const map = useMap();
  const [georaster, setGeoraster] = useState(null);
  const layerRef = useRef(null);
  const displayRef = useRef({ domainMin, domainMax, colorStops, opacity });
  displayRef.current = { domainMin, domainMax, colorStops, opacity };

  useEffect(() => {
    let cancelled = false;
    fetch(tifUrl)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${tifUrl}`); return r.arrayBuffer(); })
      .then(buf  => parseGeoraster(buf))
      .then(gr   => {
        if (cancelled) return;
        setGeoraster(gr);
        onGeoRasterReady?.(gr);
        onRawMaxReady?.(rasterMax(gr));
      })
      .catch(err => { if (!cancelled) console.error('[RasterLayer] load error:', err.message); });
    return () => { cancelled = true; onGeoRasterReady?.(null); onRawMaxReady?.(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tifUrl]);

  useEffect(() => {
    if (!georaster) return undefined;
    const { domainMin: dMin, domainMax: dMax, colorStops: cs, opacity: op } = displayRef.current;

    const PANE = 'rasterPane';
    try {
      if (!map.getPane(PANE)) {
        map.createPane(PANE);
        const p = map.getPane(PANE);
        if (p?.style) { p.style.zIndex = 650; p.style.pointerEvents = 'none'; }
      }
    } catch (_) {}

    if (layerRef.current) {
      try { map.removeLayer(layerRef.current); } catch (_) {
        try { layerRef.current.remove(); } catch (__) {}
      }
      layerRef.current = null;
    }

    try {
      map.eachLayer((l) => {
        if (!l || l === layerRef.current) return;
        if ((!!l.__isGeoRaster || !!(l.options?.pixelValuesToColorFn) || l.options?.pane === PANE)
            && !(l.options?.url || l._url)) {
          try { map.removeLayer(l); } catch (_) {}
        }
      });
    } catch (_) {}

    const layer = new GeoRasterLayer({
      georaster,
      opacity:              op,
      pixelValuesToColorFn: buildPixelColorFn(dMin, dMax, cs),
      resolution:           256,
      pane:                 PANE,
      caching:              false,
    });
    try { layer.__isGeoRaster = true; } catch (_) {}
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      try { if (map && layer) map.removeLayer(layer); } catch (_) {
        try { layer?.remove(); } catch (__) {}
      }
      try {
        const pane = map.getPane?.('rasterPane');
        if (pane) while (pane.firstChild) pane.removeChild(pane.firstChild);
      } catch (_) {}
      try {
        map.eachLayer((l) => {
          if (!l) return;
          if ((!!l.__isGeoRaster || l.options?.pane === PANE || !!(l.options?.pixelValuesToColorFn))
              && !(l.options?.url || l._url)) {
            try { map.removeLayer(l); } catch (_) {}
          }
        });
      } catch (_) {}
      if (layerRef.current === layer) layerRef.current = null;
    };
  }, [georaster, map]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.options.pixelValuesToColorFn = buildPixelColorFn(domainMin, domainMax, colorStops);
    layerRef.current.redraw();
  }, [domainMin, domainMax, colorStops]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setOpacity(opacity);
  }, [opacity]);

  return null;
}

// ─── JsonGridLayer (Colombia) ─────────────────────────────────────────────────

function JsonGridLayer({ gridMeta, filePath, domainMax, colorStops, opacity, onRawMaxReady, onValuesReady }) {
  const map = useMap();
  const layerRef = useRef(null);
  const styleRef = useRef({ domainMax, colorStops, opacity });
  styleRef.current = { domainMax, colorStops, opacity };

  // Effect 1: fetch grid JSON and rebuild the polygon layer
  useEffect(() => {
    if (!filePath || !gridMeta?.lats?.length || !gridMeta?.lons?.length) {
      onRawMaxReady?.(null);
      return undefined;
    }

    let cancelled = false;

    fetch(filePath)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${filePath}`);
        return r.json();
      })
      .then(data => {
        if (cancelled) return;

        const rawVals = Array.isArray(data.values) ? data.values : [];
        const { lats, lons } = gridMeta;
        const nlat = lats.length;
        const nlon = lons.length;
        const dlat = nlat > 1 ? Math.abs(Number(lats[1]) - Number(lats[0])) : 0.25;
        const dlon = nlon > 1 ? Math.abs(Number(lons[1]) - Number(lons[0])) : 0.25;

        const features = [];
        let rawMax = 0;

        for (let i = 0; i < nlat; i++) {
          for (let j = 0; j < nlon; j++) {
            const raw = rawVals[i * nlon + j];

            // null / undefined means this cell is absent from the dataset — skip it
            if (raw == null) continue;

            // NaN / Infinity → treat as zero so the cell renders with the first
            // colour stop rather than leaving a transparent gap in the grid
            const v = (Number.isFinite(raw) && raw > 0) ? raw : 0;
            if (v > rawMax) rawMax = v;

            const lat = Number(lats[i]);
            const lon = Number(lons[j]);
            features.push({
              type: 'Feature',
              properties: { value: v },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [lon - dlon / 2, lat - dlat / 2],
                  [lon + dlon / 2, lat - dlat / 2],
                  [lon + dlon / 2, lat + dlat / 2],
                  [lon - dlon / 2, lat + dlat / 2],
                  [lon - dlon / 2, lat - dlat / 2],
                ]],
              },
            });
          }
        }

        if (cancelled) return;

        if (layerRef.current) {
          try { map.removeLayer(layerRef.current); } catch (_) {}
          layerRef.current = null;
        }

        if (!features.length) { onRawMaxReady?.(null); return; }

        try {
          if (!map.getPane('jsonGridPane')) {
            map.createPane('jsonGridPane');
            const p = map.getPane('jsonGridPane');
            if (p) { p.style.zIndex = '645'; p.style.pointerEvents = 'none'; }
          }
        } catch (_) {}

        const layer = L.geoJSON(
          { type: 'FeatureCollection', features },
          {
            pane:        'jsonGridPane',
            interactive: false,
            style: (feature) => {
              const { domainMax: dm, colorStops: cs, opacity: op } = styleRef.current;
              const t = Math.max(0, Math.min(1, feature.properties.value / (dm || 1)));
              return { color: 'transparent', weight: 0, fillColor: stopsToColor(t, cs), fillOpacity: op };
            },
          },
        );

        layer.addTo(map);
        layerRef.current = layer;
        onRawMaxReady?.(rawMax > 0 ? rawMax : null);
        onValuesReady?.(rawVals);
      })
      .catch(err => {
        if (!cancelled) console.error('[JsonGridLayer]', err.message);
      });

    return () => {
      cancelled = true;
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch (_) {}
        layerRef.current = null;
      }
      onRawMaxReady?.(null);
      onValuesReady?.(null);    
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, gridMeta, map]);

  // Effect 2: restyle in-place when domain or opacity changes (no rebuild)
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setStyle((feature) => {
      const t = Math.max(0, Math.min(1, feature.properties.value / (domainMax || 1)));
      return { color: 'transparent', weight: 0, fillColor: stopsToColor(t, colorStops), fillOpacity: opacity };
    });
  }, [domainMax, colorStops, opacity]);

  return null;
}

// ─── ChoroplethLayer ──────────────────────────────────────────────────────────

function ChoroplethLayer({ geojson, stateDataMap, colKey, domain, colorStops, onStateClick }) {
  const styleFn = useCallback(
    (feature) => {
      const name = getFeatureName(feature);
      const row  = stateDataMap?.[name];
      const val  = row ? parseNumber(row[colKey]) : null;

      if (val == null || !Number.isFinite(val)) {
        return { fillColor: '#2a2a3a', fillOpacity: 0.5, color: '#444', weight: 0.6 };
      }
      const t = (val - domain.min) / ((domain.max - domain.min) || 1);
      return { fillColor: stopsToColor(t, colorStops), fillOpacity: 0.8, color: '#1a1a2e', weight: 0.6 };
    },
    [stateDataMap, colKey, domain, colorStops],
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      const name = getFeatureName(feature);
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
    },
    [onStateClick, stateDataMap, colKey],
  );

  if (!geojson) return null;
  return <GeoJSON data={geojson} style={styleFn} onEachFeature={onEachFeature} />;
}

// ─── StateBorderLayer ─────────────────────────────────────────────────────────

function StateBorderLayer({ geojson, selectedState, onStateClick }) {
  const styleFn = useCallback(
    (feature) => {
      const name = getFeatureName(feature);
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
      const name = getFeatureName(feature);
      layer.on({
        click(e) { e.originalEvent?.stopPropagation?.(); onStateClick(name); },
      });
    },
    [onStateClick],
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

// ─── MapView (exported) ───────────────────────────────────────────────────────

export function MapView() {
  const {
    activeDataset,
    controls,
    selectedState,
    setSelectedState,
    jsonGridDomain,
    setJsonGridDomain,
    uploadedData,
  } = useDatasetContext();

  const { data: baseData, loading, error } = useEmissionData();

  const { mapConfig, display, dataRoot } = activeDataset;
  const colorStops = display.colorScale?.stops ?? [];
  const isGridMode = controls.viewMode === 'grid';

  const [activeGeoRaster, setActiveGeoRaster] = useState(null);
  const [activeJsonGridValues, setActiveJsonGridValues] = useState(null);

  // ── Active uploaded sector (upload dataset only) ──────────────────────────
  const activeUploadSector = activeDataset.gridType === 'upload'
    ? uploadedData?.sectors?.[controls.sector] ?? null
    : null;

  // Clear the JSON grid domain when any grid-affecting control changes
  useEffect(() => {
    setJsonGridDomain(null);
  }, [activeDataset.id, controls.sector, controls.year, setJsonGridDomain]);

  // ── TIF URL (CONUS grid mode) ─────────────────────────────────────────────
  const tifUrl = useMemo(() => {
    if (!baseData?.manifest || !isGridMode) return null;
    const entry = getManifestEntry(
      baseData.manifest, controls.sector, controls.year, controls.satellite,
    );
    return entry?.tif ? resolveTifUrl(dataRoot ?? '', entry.tif) : null;
  }, [
    baseData?.manifest, controls.viewMode, controls.sector,
    controls.year, controls.satellite, dataRoot,
  ]);

  // ── Ensemble min/max URLs (posterior hover uncertainty, CONUS grid mode) ──
  // Only populated for posterior years in manifest.json -- absent for
  // "_prior" (GHGI has no ensemble), so these resolve to null there.
  const minTifUrl = useMemo(() => {
    if (!baseData?.manifest || !isGridMode) return null;
    const entry = getManifestEntry(
      baseData.manifest, controls.sector, controls.year, controls.satellite,
    );
    return entry?.minTif ? resolveTifUrl(dataRoot ?? '', entry.minTif) : null;
  }, [baseData?.manifest, controls.sector, controls.year, controls.satellite, dataRoot]);

  const maxTifUrl = useMemo(() => {
    if (!baseData?.manifest || !isGridMode) return null;
    const entry = getManifestEntry(
      baseData.manifest, controls.sector, controls.year, controls.satellite,
    );
    return entry?.maxTif ? resolveTifUrl(dataRoot ?? '', entry.maxTif) : null;
  }, [baseData?.manifest, controls.sector, controls.year, controls.satellite, dataRoot]);

  const minGeoraster = useGeoraster(minTifUrl);
  const maxGeoraster = useGeoraster(maxTifUrl);

  // ── JSON grid file path (Colombia grid mode) ──────────────────────────────
  const jsonGridFilePath = useMemo(() => {
    if (!isGridMode || activeDataset.gridType !== 'json') return null;
    return baseData?.gridFiles?.[controls.year]?.[controls.sector] ?? null;
  }, [isGridMode, activeDataset.gridType, baseData, controls.year, controls.sector]);

  // ── JSON grid uncertainty file path (posterior hover uncertainty, Colombia) ─
  const jsonUncertaintyFilePath = useMemo(() => {
    if (!isGridMode || activeDataset.gridType !== 'json') return null;
    return baseData?.gridUncertaintyFiles?.[controls.year]?.[controls.sector] ?? null;
  }, [isGridMode, activeDataset.gridType, baseData, controls.year, controls.sector]);

  const jsonMinMax = useJsonMinMax(jsonUncertaintyFilePath);

  // ── Raster/grid domain ────────────────────────────────────────────────────
  const rasterDomain = useMemo(() => {
    if (!isGridMode) return { min: 0, max: 1 };
    const scaleMax = controls.maxEmission ?? controls.colorScaleMax ?? 1.0;
    if (baseData?.manifest) {
      const g = getGlobalDomain(baseData.manifest, controls.sector);
      return { min: 0, max: g.max * scaleMax };
    }
    if (jsonGridDomain != null) {
      return { min: 0, max: jsonGridDomain.max * scaleMax };
    }
    return { min: 0, max: 1 };
  }, [
    controls.viewMode, baseData?.manifest, controls.sector,
    controls.maxEmission, controls.colorScaleMax, jsonGridDomain,
  ]);

  // ── Choropleth domain ─────────────────────────────────────────────────────
  const choroplethDomain = useMemo(() => {
    if (isGridMode || !baseData) return { min: 0, max: 10 };
    return computeChoroplethDomain(
      baseData, controls.year, controls.satellite, controls.sector,
    );
  }, [baseData, controls.viewMode, controls.year, controls.satellite, controls.sector]);

  // ── Column key for choropleth lookup ──────────────────────────────────────
  const colKey = useMemo(
    () => centralCol(controls.sector, 'state', controls.satellite),
    [controls.sector, controls.satellite],
  );

  // ── State/province data for the selected year ─────────────────────────────
  const stateDataMap = useMemo(
    () => baseData?.byYear?.[controls.year] ?? {},
    [baseData, controls.year],
  );

  const handleStateClick = useCallback(
    (name) => setSelectedState(selectedState === name ? null : name),
    [selectedState, setSelectedState],
  );

  const { initialViewState, minZoom = 2, maxZoom = 12 } = mapConfig;

  return (
    <div className="map-wrapper">

      {loading && (
        <div className="map-overlay loading">Loading data…</div>
      )}
      {!loading && error && (
        <div className="map-overlay error">Error: {error}</div>
      )}
      {!loading && !error && !selectedState && baseData?.statesGeoJSON && (
        <div className="map-overlay hint">Click a region to view regional data</div>
      )}

      {/*
        maxBounds / maxBoundsViscosity are intentionally omitted here —
        MapContainer only reads them once. MapController keeps them current.
      */}
      <MapContainer
        className="map-container"
        center={[initialViewState.latitude, initialViewState.longitude]}
        zoom={initialViewState.zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
      >
        {/* Keeps view, bounds and zoom limits in sync after dataset switches */}
        <MapController mapConfig={mapConfig} />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* Grid hover tooltip — TIF mode only */}
        {isGridMode && !activeDataset.gridType && (
          <GridHoverLayer
            georaster={activeGeoRaster}
            minGeoraster={minGeoraster}
            maxGeoraster={maxGeoraster}
            units={display.legendUnits ?? display.units}
          />
        )}

        {/* Choropleth — keyed by dataset so GeoJSON remounts on dataset switch */}
        {!isGridMode && baseData?.statesGeoJSON && (
          <ChoroplethLayer
            key={`ch-${activeDataset.id}-${controls.year}-${controls.satellite}-${colKey}`}
            geojson={baseData.statesGeoJSON}
            stateDataMap={stateDataMap}
            colKey={colKey}
            domain={choroplethDomain}
            colorStops={colorStops}
            onStateClick={handleStateClick}
          />
        )}

        {/* TIF raster (CONUS) */}
        {isGridMode && !activeDataset.gridType && tifUrl && (
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

        {/* JSON polygon grid (Colombia) */}
        {isGridMode && activeDataset.gridType === 'json' && jsonGridFilePath && (
          <JsonGridLayer
            key={jsonGridFilePath}
            gridMeta={baseData.gridMeta}
            filePath={jsonGridFilePath}
            domainMax={rasterDomain.max}
            colorStops={colorStops}
            opacity={controls.opacity ?? 0.65}
            onRawMaxReady={(max) =>
              setJsonGridDomain(max != null ? { min: 0, max } : null)
            }
            onValuesReady={setActiveJsonGridValues}
          />
        )}

        {/* JSON grid hover tooltip (Colombia) */}
        {isGridMode && activeDataset.gridType === 'json' && (
          <JsonGridHoverLayer
            gridMeta={baseData?.gridMeta}
            values={activeJsonGridValues}
            minValues={jsonMinMax?.min}
            maxValues={jsonMinMax?.max}
            units={display.legendUnits ?? display.units}
          />
        )}

        {/* Uploaded raster (TIF) */}
        {isGridMode && activeDataset.gridType === 'upload' && uploadedData?.kind === 'tif' && activeUploadSector && (
          <RasterLayer
            key={activeUploadSector.url}
            tifUrl={activeUploadSector.url}
            domainMin={rasterDomain.min}
            domainMax={rasterDomain.max}
            colorStops={colorStops}
            opacity={controls.opacity ?? 0.7}
            onGeoRasterReady={setActiveGeoRaster}
            onRawMaxReady={(max) =>
              setJsonGridDomain(max != null ? { min: 0, max } : null)
            }
          />
        )}

        {/* Uploaded raster hover tooltip */}
        {isGridMode && activeDataset.gridType === 'upload' && uploadedData?.kind === 'tif' && (
          <GridHoverLayer
            georaster={activeGeoRaster}
            units={uploadedData.meta?.units || (display.legendUnits ?? display.units)}
          />
        )}

        {/* Uploaded JSON polygon grid */}
        {isGridMode && activeDataset.gridType === 'upload' && uploadedData?.kind === 'json' && activeUploadSector && (
          <JsonGridLayer
            key={activeUploadSector.url}
            gridMeta={activeUploadSector.gridMeta}
            filePath={activeUploadSector.url}
            domainMax={rasterDomain.max}
            colorStops={colorStops}
            opacity={controls.opacity ?? 0.7}
            onRawMaxReady={(max) =>
              setJsonGridDomain(max != null ? { min: 0, max } : null)
            }
            onValuesReady={setActiveJsonGridValues}
          />
        )}

        {/* Uploaded JSON grid hover tooltip */}
        {isGridMode && activeDataset.gridType === 'upload' && uploadedData?.kind === 'json' && (
          <JsonGridHoverLayer
            gridMeta={activeUploadSector?.gridMeta}
            values={activeJsonGridValues}
            units={uploadedData.meta?.units || (display.legendUnits ?? display.units)}
          />
        )}

        {/* Region borders (grid mode) — keyed by dataset + selection */}
        {isGridMode && baseData?.statesGeoJSON && (
          <StateBorderLayer
            key={`borders-${activeDataset.id}-${selectedState}`}
            geojson={baseData.statesGeoJSON}
            selectedState={selectedState}
            onStateClick={handleStateClick}
          />
        )}
      </MapContainer>
    </div>
  );
}