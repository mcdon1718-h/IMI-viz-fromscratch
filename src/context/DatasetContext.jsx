import React, {
  createContext, useContext, useReducer,
  useState, useCallback, useMemo
} from 'react';
import { getDataset, getAllDatasets, getDatasetsByFamily } from '../config/datasetRegistry';
import { getFamily, getAllFamilies }                        from '../config/familyRegistry';
import '../config/families/index';
import '../config/datasets/index';

function defaultControls(dataset) {
  return Object.fromEntries(dataset.controls.map(c => [c.key, c.default]));
}

function reducer(state, action) {
  switch (action.type) {

    case 'SET_FAMILY': {
      const datasetsInFamily = getDatasetsByFamily(action.id);
      if (!datasetsInFamily.length) return state;
      const restoredId = state.lastDatasetByFamily[action.id] ?? datasetsInFamily[0].id;
      const dataset    = getDataset(restoredId);
      return {
        ...state,
        activeFamily:    action.id,
        activeDatasetId: restoredId,
        controls:        defaultControls(dataset),
      };
    }

    case 'SET_DATASET': {
      const dataset = getDataset(action.id);
      return {
        ...state,
        activeDatasetId: action.id,
        controls:        defaultControls(dataset),
        lastDatasetByFamily: {
          ...state.lastDatasetByFamily,
          [state.activeFamily]: action.id,
        },
      };
    }

    case 'SET_CONTROL': {
      const newControls = { ...state.controls, [action.key]: action.value };

      // Any other control whose valid options depend on this one (e.g. a
      // "week" slider scoped to the selected "year") gets reclamped to its
      // nearest valid value if the change just made its current value stale.
      const dataset = getDataset(state.activeDatasetId);
      for (const c of dataset.controls) {
        if (c.key === action.key || typeof c.options !== 'function') continue;
        const validValues = c.options(newControls).map(o => (o && typeof o === 'object' ? o.value : o));
        if (validValues.length && !validValues.includes(newControls[c.key])) {
          const current = newControls[c.key];
          // Numeric controls (e.g. a "week" slider scoped to a "year" select)
          // snap to the nearest still-valid value; others keep the original
          // "most recent" fallback (e.g. satellite change narrowing years).
          newControls[c.key] = typeof current === 'number'
            ? validValues.reduce((a, b) => Math.abs(b - current) < Math.abs(a - current) ? b : a)
            : validValues[validValues.length - 1];
        }
      }
      return { ...state, controls: newControls };
    }

    default:
      return state;
  }
}

const DatasetContext = createContext(null);

export function DatasetProvider({ initialFamilyId, initialDatasetId, children }) {
  const allFamilies = getAllFamilies();

  let resolvedDatasetId, resolvedFamilyId;
  if (initialDatasetId) {
    const ds          = getDataset(initialDatasetId);
    resolvedDatasetId = ds.id;
    resolvedFamilyId  = ds.family;
  } else {
    resolvedFamilyId  = initialFamilyId ?? allFamilies[0].id;
    resolvedDatasetId = getDatasetsByFamily(resolvedFamilyId)[0]?.id;
  }

  const initialDataset = getDataset(resolvedDatasetId);
  const [state, dispatch] = useReducer(reducer, {
    activeFamily:        resolvedFamilyId,
    activeDatasetId:     resolvedDatasetId,
    controls:            defaultControls(initialDataset),
    lastDatasetByFamily: { [resolvedFamilyId]: resolvedDatasetId },
  });

  // ── Selected region (map click → chart interaction) ──────────────────────
  const [selectedState, setSelectedStateRaw] = useState(null);

  // ── JSON grid domain (reported by JsonGridLayer, consumed by Legend) ──────
  const [jsonGridDomain, setJsonGridDomain] = useState(null);

  // ── Uploaded files (session-only, reported by UploadPanel) ────────────────
  // Shape: { kind: 'tif'|'json', sectors: { [name]: {url, gridMeta, size} }, meta: {name, units} }
  const [uploadedData, setUploadedData] = useState(null);

  // ── Display mass unit (Tg/Gg/tons) — a dashboard-wide preference, not a
  // per-dataset control, so it persists as the user switches datasets.
  // Datasets whose display.units isn't a recognized mass unit (e.g. CO2's
  // ppm) ignore it; see useDisplayUnit.
  const [massUnit, setMassUnit] = useState('Tg');

  const setSelectedState = useCallback((stateName) => {
    setSelectedStateRaw(stateName);
  }, []);

  const clearUploadedData = useCallback(() => {
    setUploadedData(prev => {
      for (const s of Object.values(prev?.sectors ?? {})) {
        if (s?.url) URL.revokeObjectURL(s.url);
      }
      return null;
    });
  }, []);

  const setActiveFamily = useCallback((id) => {
    dispatch({ type: 'SET_FAMILY', id });
    setSelectedStateRaw(null);
    setJsonGridDomain(null);
    clearUploadedData();
  }, [clearUploadedData]);

  const setActiveDataset = useCallback((id) => {
    dispatch({ type: 'SET_DATASET', id });
    setSelectedStateRaw(null);
    setJsonGridDomain(null);
    clearUploadedData();
  }, [clearUploadedData]);

  const setControl = useCallback((key, value) => {
    dispatch({ type: 'SET_CONTROL', key, value });
    if (key === 'mode') setSelectedStateRaw(null);
  }, []);

  const value = useMemo(() => ({
    activeFamily:           getFamily(state.activeFamily),
    allFamilies,
    datasetsInActiveFamily: getDatasetsByFamily(state.activeFamily),
    setActiveFamily,
    activeDataset:  getDataset(state.activeDatasetId),
    allDatasets:    getAllDatasets(),
    setActiveDataset,
    controls:       state.controls,
    setControl,
    selectedState,
    setSelectedState,
    jsonGridDomain,
    setJsonGridDomain,
    uploadedData,
    setUploadedData,
    clearUploadedData,
    massUnit,
    setMassUnit,
  }), [
    state, allFamilies, selectedState, jsonGridDomain, uploadedData, massUnit,
    setActiveFamily, setActiveDataset, setControl, setSelectedState,
    setUploadedData, clearUploadedData,
  ]);

  return (
    <DatasetContext.Provider value={value}>
      {children}
    </DatasetContext.Provider>
  );
}

export function useDatasetContext() {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error('useDatasetContext must be used inside <DatasetProvider>');
  return ctx;
}