import { useState, useEffect } from 'react';
import { useDatasetContext }   from '../context/DatasetContext';

export function useTimeSeriesData() {
  const { activeDataset, controls } = useDatasetContext();
  const [state, setState] = useState({ data: null, loading: false, error: null });

  // year is the x-axis — exclude it from triggering re-fetches
  const { year: _year, ...nonYearControls } = controls;

  useEffect(() => {
    // Dataset has no time series config — nothing to load
    if (!activeDataset.timeSeries) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    activeDataset.timeSeries.loader(nonYearControls)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err  => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });

    return () => { cancelled = true; };

  // Re-fetch when dataset or any non-year control changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset.id, ...Object.values(nonYearControls)]);

  return state;
}