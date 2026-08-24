import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';
import { useDisplayUnit }    from '../hooks/useDisplayUnit';
import { MASS_UNITS }        from '../utils/units';

export function UnitsSelector() {
  const { massUnit, setMassUnit } = useDatasetContext();
  const { supported } = useDisplayUnit();

  if (!supported) return null;

  return (
    <div className="units-selector">
      <label className="control-label" htmlFor="units-select">Units</label>
      <select
        id="units-select"
        className="select-control"
        value={massUnit}
        onChange={e => setMassUnit(e.target.value)}
      >
        {MASS_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}
