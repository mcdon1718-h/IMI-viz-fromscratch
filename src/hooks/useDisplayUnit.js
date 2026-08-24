import { useDatasetContext } from '../context/DatasetContext';
import { parseDisplayUnit, convertMass, formatDisplayUnit } from '../utils/units';

// Resolves the active dataset's native units against the dashboard-wide
// mass-unit preference. Datasets whose display.units isn't a recognized
// mass unit (e.g. CO2's ppm) fall through unconverted.
export function useDisplayUnit() {
  const { activeDataset, massUnit } = useDatasetContext();
  const { massUnit: nativeUnit, timeSuffix } = parseDisplayUnit(activeDataset.display.units);
  const supported = nativeUnit != null;
  const unit  = supported ? massUnit : nativeUnit;
  const label = supported ? formatDisplayUnit(unit, timeSuffix) : activeDataset.display.units;

  return {
    supported,
    label,
    convert: (value) => supported ? convertMass(value, nativeUnit, unit) : value,
  };
}
