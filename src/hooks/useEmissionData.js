import { useState, useEffect } from 'react';
import { useDatasetContext }   from '../context/DatasetContext';

export function useEmissionData() {
  const { activeDataset, controls } = useDatasetContext();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  // reloadTrigger: [] = only reload on dataset switch (load all data once)
  //                ['satellite'] = also reload when satellite changes
  //                undefined / 'all' = reload on any control change (default)
  const trigger = activeDataset.reloadTrigger;
  const controlTriggerValues =
    trigger === undefined || trigger === 'all'
      ? Object.values(controls)
      : trigger.map(k => controls[k]);

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    activeDataset.dataLoader(controls)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err  => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });

    return () => { cancelled = true; };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset.id, ...controlTriggerValues]);

  return state;
}