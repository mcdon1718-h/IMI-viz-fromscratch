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

      // If satellite changed, snap year to nearest valid option
      if (action.key === 'satellite') {
        const dataset     = getDataset(state.activeDatasetId);
        const yearControl = dataset.controls.find(c => c.key === 'year');
        if (yearControl?.options && typeof yearControl.options === 'function') {
          const validYears = yearControl.options(newControls);
          if (!validYears.includes(newControls.year)) {
            newControls.year = validYears[validYears.length - 1];
          }
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

  // ── Selected state (for map click → chart interaction) ──────────────────────
  const [selectedState, setSelectedStateRaw] = useState(null);

  // Reset selected state when dataset or mode changes
  const setSelectedState = useCallback((stateName) => {
    setSelectedStateRaw(stateName);
  }, []);

  const setActiveFamily  = useCallback((id) => { dispatch({ type: 'SET_FAMILY',  id }); setSelectedStateRaw(null); }, []);
  const setActiveDataset = useCallback((id) => { dispatch({ type: 'SET_DATASET', id }); setSelectedStateRaw(null); }, []);
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
    // ── NEW ──
    selectedState,
    setSelectedState,
  }), [state, allFamilies, selectedState, setActiveFamily, setActiveDataset, setControl, setSelectedState]);

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