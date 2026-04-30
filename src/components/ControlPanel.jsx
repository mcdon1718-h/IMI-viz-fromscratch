import React from 'react';
import { useDatasetContext } from '../context/DatasetContext';

// ─── Generic renderer map ─────────────────────────────────────────────────────

const ControlRenderers = {
  slider:      SliderControl,
  select:      SelectControl,
  radio:       RadioControl,
  multiselect: MultiSelectControl,
};

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ControlPanel() {
  const { activeDataset, controls, setControl } = useDatasetContext();

  return (
    <div className="control-panel">
      <span className="control-panel-title">Filters</span>

      {activeDataset.controls.map(def => {
        const Renderer = ControlRenderers[def.type];
        if (!Renderer) return null;
        return (
          <div key={def.key} className="control-group">
            <label className="control-label">{def.label}</label>
            <Renderer
              def={def}
              value={controls[def.key]}
              onChange={v => setControl(def.key, v)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Control primitives ───────────────────────────────────────────────────────

function SliderControl({ def, value, onChange }) {
  const { options } = def;
  const min = options[0];
  const max = options[options.length - 1];

  function handleChange(e) {
    const raw = Number(e.target.value);
    const snapped = options.reduce((a, b) =>
      Math.abs(b - raw) < Math.abs(a - raw) ? b : a
    );
    onChange(snapped);
  }

  return (
    <div className="slider-control">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={handleChange}
        list={`ticks-${def.key}`}
      />
      <datalist id={`ticks-${def.key}`}>
        {options.map(v => <option key={v} value={v} />)}
      </datalist>
      <span className="slider-value">{value}</span>
    </div>
  );
}

function SelectControl({ def, value, onChange }) {
  return (
    <select
      className="select-control"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {def.options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function RadioControl({ def, value, onChange }) {
  return (
    <div className="radio-control">
      {def.options.map(opt => (
        <label
          key={opt.value}
          className={`radio-option ${value === opt.value ? 'active' : ''}`}
        >
          <input
            type="radio"
            name={def.key}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function MultiSelectControl({ def, value = [], onChange }) {
  function toggle(v) {
    onChange(
      value.includes(v)
        ? value.filter(x => x !== v)
        : [...value, v]
    );
  }
  return (
    <div className="radio-control">
      {def.options.map(opt => (
        <label
          key={opt.value}
          className={`radio-option ${value.includes(opt.value) ? 'active' : ''}`}
        >
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}