import { useState, useEffect } from 'react';
import { useDatasetContext } from '../context/DatasetContext';

export function useEmissionData() {
  const { activeDataset, controls } = useDatasetContext();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    activeDataset.dataLoader(controls)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err  => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });

    return () => { cancelled = true; };

  // Re-fetch whenever dataset OR any control value changes
  }, [activeDataset.id, ...Object.values(controls)]); // eslint-disable-line

  return state;
}