// mirrors dataset registry pattern for CH4/ CO2 families
const familyRegistry = new Map();

/**
 * Register a gas family (CH4, CO2, …).
 * Called as a side effect from each family config file.
 * @param {FamilyConfig} config
 */
export function registerFamily(config) {
  validateFamilyConfig(config);
  familyRegistry.set(config.id, Object.freeze(config));
}

export function getFamily(id) {
  if (!familyRegistry.has(id)) throw new Error(`Family "${id}" not registered.`);
  return familyRegistry.get(id);
}

export function getAllFamilies() {
  return [...familyRegistry.values()];
}

// ─── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_FAMILY_FIELDS = ['id', 'name', 'label', 'description', 'theme'];
const REQUIRED_THEME_FIELDS  = ['accent', 'accentDim', 'accentText'];

function validateFamilyConfig(config) {
  for (const field of REQUIRED_FAMILY_FIELDS) {
    if (config[field] == null)
      throw new Error(`Family "${config.id}" missing required field: "${field}"`);
  }
  for (const field of REQUIRED_THEME_FIELDS) {
    if (config.theme[field] == null)
      throw new Error(`Family "${config.id}" theme missing: "${field}"`);
  }
}