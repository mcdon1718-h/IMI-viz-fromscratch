import React, { useState, useCallback, useMemo } from 'react';
import parseGeoraster from 'georaster';
import { useDatasetContext } from '../context/DatasetContext';
import { rasterSum, flatArraySum } from '../utils/gridStats';

const MAX_FILE_BYTES  = 100 * 1024 * 1024; // 100 MB per file
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MB per session, across all sectors + grid shape
const RASTER_EXTENSIONS = ['.tif', '.tiff'];

function getExtension(filename) {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function stripExtension(filename) {
  return filename.replace(/\.[^./]+$/, '');
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

// Accepts either top-level {lats, lons} or a nested {grid: {lats, lons}} —
// the latter matches Colombia's own chart_summary.json shape, so that file
// can be dropped in directly instead of hand-extracting the "grid" key.
function extractGridShape(parsed) {
  if (Array.isArray(parsed?.lats) && Array.isArray(parsed?.lons)) {
    return { lats: parsed.lats, lons: parsed.lons };
  }
  if (Array.isArray(parsed?.grid?.lats) && Array.isArray(parsed?.grid?.lons)) {
    return { lats: parsed.grid.lats, lons: parsed.grid.lons };
  }
  return null;
}

function projectedTotalBytes(usedBytes, sectors, sectorKey, fileSize) {
  const existingSize = sectors[sectorKey]?.size ?? 0;
  return usedBytes - existingSize + fileSize;
}

export function UploadPanel() {
  const {
    uploadedData, setUploadedData, clearUploadedData,
    setJsonGridDomain, controls, setControl,
  } = useDatasetContext();
  const [sectorName, setSectorName] = useState('');
  const [error, setError]           = useState(null);

  const sectors    = useMemo(() => uploadedData?.sectors ?? {}, [uploadedData]);
  const sectorKeys = Object.keys(sectors);
  const usedBytes  = sectorKeys.reduce((sum, k) => sum + (sectors[k].size ?? 0), 0)
    + (uploadedData?.sharedGridMeta?.size ?? 0);
  const usedPct    = Math.min(100, (usedBytes / MAX_TOTAL_BYTES) * 100);

  const handleFile = useCallback(async (file) => {
    setError(null);
    if (!file) return;

    const ext      = getExtension(file.name);
    const isRaster = RASTER_EXTENSIONS.includes(ext);
    const isJson   = ext === '.json';

    if (!isRaster && !isJson) {
      setError('Unsupported file type — please upload a .tif, .tiff, or .json file.');
      return;
    }

    const newKind = isRaster ? 'tif' : 'json';
    if (uploadedData?.kind && uploadedData.kind !== newKind) {
      setError(
        `This session is using ${uploadedData.kind === 'tif' ? 'GeoTIFFs' : 'JSON grids'} — ` +
        'clear all sectors first to switch formats.'
      );
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(`File is too large (${mb(file.size)} MB) — the limit is ${mb(MAX_FILE_BYTES)} MB per file.`);
      return;
    }

    const metaName  = uploadedData?.meta?.name  || null;
    const metaUnits = uploadedData?.meta?.units || null;

    if (isRaster) {
      const sectorKey = sectorName.trim() || stripExtension(file.name);
      const projectedTotal = projectedTotalBytes(usedBytes, sectors, sectorKey, file.size);
      if (projectedTotal > MAX_TOTAL_BYTES) {
        setError(
          `Adding this file would use ${mb(projectedTotal)} MB of your ${mb(MAX_TOTAL_BYTES)} MB session ` +
          'limit — remove a sector or use a smaller file.'
        );
        return;
      }
      // Parsed once up front (in addition to the deferred parse RasterLayer does
      // when this sector is actively displayed) so every sector has a comparable
      // total available for the sector bar chart, not just the currently-viewed one.
      let sum;
      try {
        const georaster = await parseGeoraster(await file.arrayBuffer());
        sum = rasterSum(georaster);
      } catch (err) {
        setError(`Could not parse GeoTIFF: ${err.message}`);
        return;
      }

      if (sectors[sectorKey]?.url) URL.revokeObjectURL(sectors[sectorKey].url);

      const url = URL.createObjectURL(file);
      setJsonGridDomain(null);
      setUploadedData({
        ...uploadedData,
        kind:    'tif',
        sectors: { ...sectors, [sectorKey]: { url, gridMeta: null, size: file.size, sum } },
        meta:    { name: metaName ?? file.name, units: metaUnits ?? '' },
      });
      setControl('sector', sectorKey);
      setSectorName('');
      return;
    }

    // JSON grid
    let text, parsed;
    try {
      text = await file.text();
      parsed = JSON.parse(text);
    } catch (err) {
      setError(`Could not parse JSON: ${err.message}`);
      return;
    }

    if (!Array.isArray(parsed?.values)) {
      setError('JSON must contain a "values" array.');
      return;
    }

    // Self-contained files (their own lats/lons) always take priority; only
    // fall back to a previously-uploaded shared grid shape when the file
    // itself doesn't carry coordinates (e.g. Colombia-style split exports).
    let gridMeta;
    if (Array.isArray(parsed.lats) && Array.isArray(parsed.lons)) {
      gridMeta = { lats: parsed.lats, lons: parsed.lons };
    } else if (uploadedData?.sharedGridMeta) {
      gridMeta = { lats: uploadedData.sharedGridMeta.lats, lons: uploadedData.sharedGridMeta.lons };
    } else {
      setError(
        'This file has no "lats"/"lons" arrays — either include them directly in the file, ' +
        'or upload a shared grid shape file first for split-format datasets.'
      );
      return;
    }

    const expectedLen = gridMeta.lats.length * gridMeta.lons.length;
    if (parsed.values.length !== expectedLen) {
      setError(`"values" length (${parsed.values.length}) must equal lats.length × lons.length (${expectedLen}).`);
      return;
    }

    const sectorKey = sectorName.trim() || parsed.sector || stripExtension(file.name);
    const projectedTotal = projectedTotalBytes(usedBytes, sectors, sectorKey, file.size);
    if (projectedTotal > MAX_TOTAL_BYTES) {
      setError(
        `Adding this file would use ${mb(projectedTotal)} MB of your ${mb(MAX_TOTAL_BYTES)} MB session ` +
        'limit — remove a sector or use a smaller file.'
      );
      return;
    }
    if (sectors[sectorKey]?.url) URL.revokeObjectURL(sectors[sectorKey].url);

    const blob = new Blob([text], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const sum  = flatArraySum(parsed.values);
    setJsonGridDomain(null);
    setUploadedData({
      ...uploadedData,
      kind:    'json',
      sectors: { ...sectors, [sectorKey]: { url, gridMeta, size: file.size, sum } },
      meta: {
        name:  metaName  ?? parsed.title ?? file.name,
        units: metaUnits ?? parsed.units ?? '',
      },
    });
    setControl('sector', sectorKey);
    setSectorName('');
  }, [
    sectorName, uploadedData, sectors, usedBytes,
    setUploadedData, setJsonGridDomain, setControl,
  ]);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
    e.target.value = ''; // allow re-selecting the same file
  }, [handleFile]);

  const handleGridShapeFile = useCallback(async (file) => {
    setError(null);
    if (!file) return;

    if (getExtension(file.name) !== '.json') {
      setError('Grid shape file must be a .json file.');
      return;
    }
    if (uploadedData?.kind === 'tif') {
      setError('Grid shape files only apply to JSON grids — clear all sectors first to switch formats.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is too large (${mb(file.size)} MB) — the limit is ${mb(MAX_FILE_BYTES)} MB per file.`);
      return;
    }

    const existingShapeSize = uploadedData?.sharedGridMeta?.size ?? 0;
    const projectedTotal = usedBytes - existingShapeSize + file.size;
    if (projectedTotal > MAX_TOTAL_BYTES) {
      setError(
        `Adding this file would use ${mb(projectedTotal)} MB of your ${mb(MAX_TOTAL_BYTES)} MB session ` +
        'limit — remove a sector or use a smaller file.'
      );
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      setError(`Could not parse JSON: ${err.message}`);
      return;
    }

    const shape = extractGridShape(parsed);
    if (!shape) {
      setError(
        'Could not find "lats"/"lons" arrays — either at the top level, or nested under a ' +
        '"grid" key (e.g. "grid.lats"/"grid.lons").'
      );
      return;
    }

    setUploadedData({
      kind:    uploadedData?.kind ?? null,
      sectors,
      meta:    uploadedData?.meta ?? { name: '', units: '' },
      sharedGridMeta: { lats: shape.lats, lons: shape.lons, size: file.size },
    });
  }, [uploadedData, sectors, usedBytes, setUploadedData]);

  const handleGridShapeInputChange = useCallback((e) => {
    const file = e.target.files?.[0] ?? null;
    handleGridShapeFile(file);
    e.target.value = '';
  }, [handleGridShapeFile]);

  const handleRemoveGridShape = useCallback(() => {
    if (!uploadedData?.sharedGridMeta) return;
    const rest = { ...uploadedData };
    delete rest.sharedGridMeta;
    if (!Object.keys(rest.sectors ?? {}).length && !rest.kind) {
      setUploadedData(null);
    } else {
      setUploadedData(rest);
    }
  }, [uploadedData, setUploadedData]);

  const handleRemoveSector = useCallback((key) => {
    if (!sectors[key]) return;
    if (sectors[key].url) URL.revokeObjectURL(sectors[key].url);

    const rest = { ...sectors };
    delete rest[key];
    const remainingKeys = Object.keys(rest);

    if (!remainingKeys.length) {
      if (uploadedData?.sharedGridMeta) {
        setUploadedData({ kind: null, sectors: {}, meta: uploadedData.meta, sharedGridMeta: uploadedData.sharedGridMeta });
      } else {
        setUploadedData(null);
      }
      setControl('sector', '');
      return;
    }
    setUploadedData({ ...uploadedData, sectors: rest });
    if (controls.sector === key) setControl('sector', remainingKeys[0]);
  }, [sectors, uploadedData, controls.sector, setUploadedData, setControl]);

  const handleClearAll = useCallback(() => {
    clearUploadedData();
    setControl('sector', '');
    setError(null);
  }, [clearUploadedData, setControl]);

  return (
    <div className="upload-panel">
      <span className="upload-panel-title">Upload Your Data</span>

      <div className="upload-field">
        <label className="control-label">Sector name (optional)</label>
        <input
          type="text"
          className="upload-text-input"
          placeholder="e.g. Oil & Gas — defaults to the filename"
          value={sectorName}
          onChange={e => setSectorName(e.target.value)}
        />
      </div>

      <div className="upload-field">
        <label className="control-label">File (.tif, .tiff, or .json)</label>
        <input
          type="file"
          className="upload-file-input"
          accept=".tif,.tiff,.json"
          onChange={handleInputChange}
        />
      </div>
<div className="upload-field">
        <label className="control-label">Split-format datasets (optional)</label>

        {uploadedData?.sharedGridMeta ? (
          <div className="upload-sector-row">
            <span className="upload-sector-name">
              Grid shape loaded ({uploadedData.sharedGridMeta.lats.length} × {uploadedData.sharedGridMeta.lons.length})
            </span>
            <span className="upload-sector-size">{mb(uploadedData.sharedGridMeta.size)} MB</span>
            <button
              type="button"
              className="upload-sector-remove"
              onClick={handleRemoveGridShape}
              aria-label="Remove grid shape"
            >
              ×
            </button>
          </div>
        ) : (
          <input
            type="file"
            className="upload-file-input"
            accept=".json"
            onChange={handleGridShapeInputChange}
          />
        )}

        <p className="upload-hint">
          If your sector files don't include "lats"/"lons" themselves, upload that shared
          grid shape file once here, then upload sector files with just "values" as usual.
          Accepts "lats"/"lons" either at the top level or nested under a "grid" key.
        </p>
      </div>

      <div className="upload-usage">
        <div className="upload-usage-bar">
          <div className="upload-usage-fill" style={{ width: `${usedPct}%` }} />
        </div>
        <span className="upload-usage-label">
          {mb(usedBytes)} MB of {mb(MAX_TOTAL_BYTES)} MB used
        </span>
      </div>

      <p className="upload-hint">
        Each sector you add is held in your browser's memory at once, so
        uploading many sectors or very large files may not all fit — if a
        file is rejected, remove a sector or use smaller files.
      </p>

      

      {error && <div className="upload-error">{error}</div>}

      {sectorKeys.length > 0 && (
        <div className="upload-sector-list">
          {sectorKeys.map(key => (
            <div
              key={key}
              className={`upload-sector-row ${controls.sector === key ? 'active' : ''}`}
            >
              <span className="upload-sector-name">{key}</span>
              <span className="upload-sector-size">{mb(sectors[key].size)} MB</span>
              <button
                type="button"
                className="upload-sector-remove"
                onClick={() => handleRemoveSector(key)}
                aria-label={`Remove ${key}`}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="upload-clear-btn" onClick={handleClearAll}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
