'use client';

import { MODELS } from '../lib/models';

const PROVIDER_LABEL = { anthropic: 'Claude', google: 'Gemini' };

export default function ModelSelect({ value, onChange }) {
  const active = MODELS.find((m) => m.id === value) || MODELS[1];

  function formatPrice(m) {
    if (m.price.input === 0 && m.price.output === 0) return 'Gratis';
    return `$${m.price.input} / MTok input, $${m.price.output} / MTok output`;
  }

  return (
    <div className="field model-select">
      <label className="field-label">Model AI</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            [{PROVIDER_LABEL[m.provider] || m.provider}] {m.label} — {m.badge} ({formatPrice(m)})
          </option>
        ))}
      </select>
      <div className="model-badges">
        {MODELS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={'model-badge' + (m.id === value ? ' active' : '')}
            style={{ '--badge-color': m.badgeColor }}
            onClick={() => onChange(m.id)}
            title={m.description}
          >
            {m.shortLabel} · {m.badge}
          </button>
        ))}
      </div>
      <div className="model-cost-hint">
        {active.description} Estimasi biaya API: {formatPrice(active)}.
      </div>
    </div>
  );
}
