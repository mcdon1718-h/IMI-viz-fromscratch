# User-uploaded GeoTIFF/JSON grid visualization

## Context

The user wants site visitors to upload their own single-band GeoTIFF or a
JSON-encoded value grid and see it rendered on the same map/legend/tooltip
UI already used for `ch4-conus` and `ch4-colombia`. The site deploys via
`gh-pages` to GitHub Pages — static files only, no backend, no database.
That means "upload" can only ever mean **client-side, this-browser-only**
processing: the file is parsed in JS via the File API and never leaves the
visitor's machine. Per the user's answers: reuse the existing dataset
registry/switcher (not a standalone page), no cross-refresh persistence
(session-only), and support both GeoTIFF and JSON grid from day one.

**Key architectural insight**: every existing map layer (`RasterLayer`,
`JsonGridLayer`, `useGeoraster`, `useJsonMinMax`) already loads data via
`fetch(url)` — it never fetches a network URL directly, it takes any
fetchable URL string. `URL.createObjectURL(file)` produces a `blob:` URL
that `fetch()` treats identically to a network URL. This means the entire
existing rendering stack (raster coloring, polygon grid, hover tooltip,
opacity) can be reused **completely unmodified** for uploaded files — the
new code is almost entirely upload UI + wiring, not new rendering logic.

## Approach

### 1. New family + dataset registration
- `src/config/families/upload.js` — `registerFamily({ id: 'UPLOAD', name: 'Your Data', label: 'Upload', dashboardTitle: 'Upload Viewer', theme: {...} })`, mirroring `ch4.js`/`co2.js`. Add the import to `src/config/families/index.js`.
- `src/config/datasets/upload/custom.js` — `registerDataset({ id: 'user-upload', family: 'UPLOAD', gridType: 'upload', ... })`. `gridType: 'upload'` is a new value `MapView.jsx` will branch on (alongside the existing `undefined`=TIF and `'json'` branches).
  - `controls`: only `opacity` and `colorScaleMax` sliders (reuse existing slider control, no new control types). Include a `viewMode` control too since `MapView`'s `isGridMode = controls.viewMode === 'grid'` gate requires it — give it a single `'grid'` option and `visible: () => false` (existing `visible` mechanism in `ControlPanel.jsx`) so it's never shown but still defaults correctly. No choropleth mode — there's no boundary-join key for arbitrary user data.
  - `dataLoader()`: returns a static empty-shape stub synchronously (`{ statesGeoJSON: null, manifest: null, gridFiles: null, gridMeta: null, sectorKeys: [], byYear: {}, nationalPosterior: {}, nationalPrior: null, stateByYearPrior: {} }`) so the rest of the app's optional-chained `baseData?.x` accesses stay harmless. `reloadTrigger: []`.
  - `SectorBarChart.jsx`, `TimeSeriesPlot.jsx`, `DataTotals.jsx` need **zero changes** — each already gates on an explicit `SUPPORTED` id allowlist (e.g. `DataTotals.jsx:6`) and will no-op for `'user-upload'` automatically.

### 2. New context state for the uploaded file
In `src/context/DatasetContext.jsx`, add `uploadedData`/`setUploadedData` state, following the exact same pattern as the existing `selectedState`/`jsonGridDomain` (state that lives outside the generic `controls` reducer because it's reported by a layer/component, not user-selected from a dropdown). Shape:
```js
{ kind: 'tif' | 'json', url: string /* blob URL */, gridMeta: {lats,lons} | null, meta: { name, units } }
```
Reset it (and revoke the previous blob URL) whenever `setActiveDataset`/`setActiveFamily` fire, mirroring the existing `setJsonGridDomain(null)` resets already there.

### 3. New `UploadPanel` component
`src/components/UploadPanel.jsx`, rendered from `Dashboard.jsx` right above `<ControlPanel />`, gated on `activeDataset.id === 'user-upload'` (same pattern as `DataTotals.jsx`'s `SUPPORTED` check). Contains:
- A file input (`accept=".tif,.tiff,.json"`) plus two text fields: **Display name** and **Units label** (both free text — physical units/title can't be inferred from a raw file).
- On file select:
  - Reject if extension isn't `.tif`/`.tiff`/`.json`, or if size exceeds a constant cap (e.g. 100 MB) — show an inline error, don't touch context.
  - `.tif`/`.tiff`: `URL.createObjectURL(file)` → `setUploadedData({ kind: 'tif', url, gridMeta: null, meta })`. No pre-parsing needed; `RasterLayer` already fetches+parses on its own.
  - `.json`: `await file.text()` → `JSON.parse` in a `try/catch` → validate `Array.isArray(lats)`, `Array.isArray(lons)`, `Array.isArray(values)`, and `values.length === lats.length * lons.length`; on failure show a specific inline error (which check failed) and don't touch context. On success, build `gridMeta = { lats, lons }`, wrap the same text in `new Blob([text], {type:'application/json'})` → `URL.createObjectURL(...)` (the existing `JsonGridLayer` only reads `data.values`, so the same file works unmodified even though it also carries `lats`/`lons`), then `setUploadedData({ kind: 'json', url, gridMeta, meta })`.
  - Also call `setJsonGridDomain(null)` on any new upload so the legend doesn't show a stale domain until the new layer reports its own.
- A "Clear" button that revokes the blob URL and resets `uploadedData` to `null`.

### 4. `MapView.jsx` changes
- Add a third render branch parallel to the existing `!activeDataset.gridType` (TIF) and `gridType === 'json'` (Colombia) ones, gated on `activeDataset.gridType === 'upload' && uploadedData`:
  - `uploadedData.kind === 'tif'` → render `RasterLayer` with `tifUrl={uploadedData.url}` and `GridHoverLayer` with `minGeoraster`/`maxGeoraster` both omitted (they already default to `null`/no-spread — no change needed there).
  - `uploadedData.kind === 'json'` → render `JsonGridLayer`/`JsonGridHoverLayer` with `filePath={uploadedData.url}` and `gridMeta={uploadedData.gridMeta}` (sourced from the upload itself, not `baseData.gridMeta`).
- `RasterLayer` needs one small **additive** change: an optional `onRawMaxReady` callback, called once the georaster is parsed, scanning `georaster.values[0]` for the max finite positive value (ignoring `noDataValue`) — mirrors what `JsonGridLayer` already does while building `rawMax`. Existing CONUS usage doesn't pass this prop, so it's a no-op there.
- Wire `onRawMaxReady` (both the tif and json cases) to `setJsonGridDomain`, reusing the existing generic "the active grid layer reported this domain" channel — no new Legend state needed.
- Units/title source: for `activeDataset.id === 'user-upload'`, read `uploadedData?.meta?.units`/`.name` instead of the static `display.legendUnits`/`display.legendTitle` (same per-dataset-id conditional style already used in `SectorBarChart.jsx`/`TimeSeriesPlot.jsx`).

### 5. `Legend.jsx`
No structural change — it already branches on `jsonGridDomain != null` for the "dynamically reported" domain case (`Legend.jsx:30`), which the upload path now also populates. Only change: source `display.legendTitle`/units the same conditional way as in MapView for the `user-upload` id.

## What users need to provide

**GeoTIFF (`.tif`/`.tiff`)**
- Single-band raster, values = the physical quantity to display.
- **Must be in geographic WGS84 (EPSG:4326)** — the existing pixel-lookup math (`getValueAtLatLng` in `MapView.jsx`) treats the raster's `xmin/xmax/ymin/ymax` directly as lat/lng, with no reprojection step. A projected CRS (e.g. UTM) must be reprojected first (e.g. `gdalwarp -t_srs EPSG:4326`) — flag this clearly in the upload UI.
- Cells with no data: either a proper GeoTIFF NoData tag, or left as 0/negative — the existing lookup treats values `<= 0` as no-data uniformly (same behavior as CONUS today, not a new limitation).
- A **display name** and **units label** typed alongside the upload (can't be inferred from the raster).

**JSON grid (`.json`)** — self-contained (no shared external `gridMeta` like Colombia has), schema:
```json
{
  "lats":   [ ... ],       // 1-D array, latitude of each row's cell centers
  "lons":   [ ... ],       // 1-D array, longitude of each column's cell centers
  "values": [ ... ],       // flat, row-major: values[i * lons.length + j] for (lats[i], lons[j]); null = no data
  "units":  "kg km-2 h-1",  // optional — can also be typed into the upload form
  "title":  "My dataset"    // optional — can also be typed into the upload form
}
```
- `values.length` must equal `lats.length * lons.length`.
- Grid must be regular/evenly spaced (matches the existing nearest-neighbor, half-cell-width lookup in `getValueAtLatLngFromGrid`).

**Practical limits (communicate in the UI)**: everything runs in the visitor's own tab with no server, so an explicit file-size cap (~100 MB) and a try/catch around every parse step are required — a bad or huge file should show an inline error, not freeze/crash the tab.

## Explicitly out of scope
- No cross-refresh persistence (confirmed with user) — refreshing or switching dataset clears the upload.
- No choropleth mode for uploads (no boundary/join-key data to shade).
- No reprojection support — GeoTIFFs must already be EPSG:4326.
- No configurable no-data threshold — reuses the existing `<= 0` convention app-wide.

## Files touched
- `src/config/families/upload.js` (new), `src/config/families/index.js` (+1 import)
- `src/config/datasets/upload/custom.js` (new), `src/config/datasets/index.js` (+1 import)
- `src/context/DatasetContext.jsx` (+ `uploadedData` state)
- `src/components/UploadPanel.jsx` (new)
- `src/components/Dashboard.jsx` (+1 render line)
- `src/components/MapView.jsx` (new render branch + `RasterLayer` `onRawMaxReady` prop + units/title source)
- `src/components/Legend.jsx` (units/title source only)

## Verification
- `npm run dev` (or fix the existing broken `rolldown` native binding first — pre-existing env issue, unrelated to this work) and manually: switch to the "Upload" family, upload a known-good small GeoTIFF (EPSG:4326) and confirm it renders + hovers with a value; upload a hand-written small JSON grid matching the schema and confirm the same; upload a malformed JSON (mismatched array lengths) and confirm a clear inline error with no crash; confirm switching away and back clears the upload (no persistence).
- `npx eslint src/components/MapView.jsx src/components/UploadPanel.jsx src/context/DatasetContext.jsx` — check no new error classes beyond the pre-existing `react-hooks/set-state-in-effect` pattern already accepted elsewhere in this file.
