import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';

export function FamilySelector() {
  const { activeFamily, allFamilies, setActiveFamily } = useDatasetContext();

  return (
    <div className="family-selector" role="radiogroup" aria-label="Emission gas family">
      {allFamilies.map((family) => {
        const isActive = family.id === activeFamily.id;
        return (
          <button
            key={family.id}
            role="radio"
            aria-checked={isActive}
            className={`family-tab ${isActive ? 'active' : ''}`}
            onClick={() => setActiveFamily(family.id)}
            title={family.description}
            style={{ '--tab-accent': family.theme.accent }}
          >
            <span className="family-tab-formula">{family.label}</span>
            <span className="family-tab-name">{family.name}</span>
          </button>
        );
      })}
    </div>
  );
}