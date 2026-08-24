// Linear mass-unit conversion for emissions totals. Grams-per-unit lets any
// pair convert via a single multiply/divide instead of a conversion table.
const GRAMS_PER_UNIT = {
  Tg:   1e12,
  Gg:   1e9,
  Tons: 1e6, // metric ton = 1 Mg
};

export const MASS_UNITS = ['Tg', 'Gg', 'Tons'];

// Splits a display unit string like 'Tg/yr' or 'Gg/week' into its mass
// prefix and time suffix. massUnit is null when the string doesn't start
// with a known mass unit (e.g. 'ppm', '') — those datasets don't support
// the units dropdown and are shown as-is.
export function parseDisplayUnit(unitStr) {
  const str = unitStr ?? '';
  for (const unit of MASS_UNITS) {
    if (str === unit || str.startsWith(`${unit}/`)) {
      return { massUnit: unit, timeSuffix: str.slice(unit.length) };
    }
  }
  return { massUnit: null, timeSuffix: '' };
}

export function convertMass(value, fromUnit, toUnit) {
  if (value == null || !Number.isFinite(value) || fromUnit === toUnit) return value;
  return value * (GRAMS_PER_UNIT[fromUnit] / GRAMS_PER_UNIT[toUnit]);
}

export function formatDisplayUnit(massUnit, timeSuffix) {
  return `${massUnit}${timeSuffix}`;
}
