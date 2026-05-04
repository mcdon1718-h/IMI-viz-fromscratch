import { useState, useEffect } from 'react';
import { useDatasetContext }   from '../context/DatasetContext';

export function useSectorData() {
  const { activeDataset, controls } = useDatasetContext();
  const [state, setState] = useState({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!activeDataset.sectorBreakdown) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    activeDataset.sectorBreakdown.loader(controls)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err  => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });

    return () => { cancelled = true; };

  // Re-fetch when dataset, year, or satellite changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset.id, controls.year, controls.satellite]);

  return state;
}