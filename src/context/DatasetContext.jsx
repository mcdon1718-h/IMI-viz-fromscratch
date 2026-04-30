import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { getDataset, getAllDatasets, getDatasetsByFamily } from '../config/datasetRegistry';
import { getFamily, getAllFamilies }                        from '../config/familyRegistry';

// Side-effect imports — families must be registered before datasets
import '../config/families/index';
import '../config/datasets/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultControls(dataset) {
  return Object.fromEntries(dataset.controls.map(c => [c.key, c.default]));
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {

    case 'SET_FAMILY': {
      const familyId = action.id;
      const datasetsInFamily = getDatasetsByFamily(familyId);

      if (!datasetsInFamily.length) {
        console.warn(`No datasets registered for family "${familyId}"`);
        return state;
      }

      // Restore the last-used dataset in this family, or fall back to first
      const restoredId = state.lastDatasetByFamily[familyId] ?? datasetsInFamily[0].id;
      const dataset    = getDataset(restoredId);

      return {
        ...state,
        activeFamily:    familyId,
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
        // Remember which dataset was last used within this family
        lastDatasetByFamily: {
          ...state.lastDatasetByFamily,
          [state.activeFamily]: action.id,
        },
      };
    }

    case 'SET_CONTROL':
      return {
        ...state,
        controls: { ...state.controls, [action.key]: action.value },
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DatasetContext = createContext(null);

export function DatasetProvider({ initialFamilyId, initialDatasetId, children }) {
  // Resolve initial family + dataset, letting either prop drive the other
  const allFamilies = getAllFamilies();

  let resolvedDatasetId, resolvedFamilyId;

  if (initialDatasetId) {
    // Dataset prop takes precedence — derive family from it
    const ds         = getDataset(initialDatasetId);
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

  const setActiveFamily  = useCallback((id) => dispatch({ type: 'SET_FAMILY',  id }), []);
  const setActiveDataset = useCallback((id) => dispatch({ type: 'SET_DATASET', id }), []);
  const setControl = useCallback(
    (key, value) => dispatch({ type: 'SET_CONTROL', key, value }),
    []
  );

  const value = useMemo(() => ({
    // Family
    activeFamily:           getFamily(state.activeFamily),
    allFamilies,
    datasetsInActiveFamily: getDatasetsByFamily(state.activeFamily),
    setActiveFamily,
    // Dataset
    activeDataset:  getDataset(state.activeDatasetId),
    allDatasets:    getAllDatasets(),
    setActiveDataset,
    // Controls
    controls:  state.controls,
    setControl,
  }), [state, allFamilies, setActiveFamily, setActiveDataset, setControl]);

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