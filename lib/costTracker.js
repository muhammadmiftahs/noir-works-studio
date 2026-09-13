// Cost tracker: menghitung estimasi biaya API (USD) per sesi generate
// berdasarkan model, approx input/output tokens, dan biaya per MTok.
// Bukan angka final/resmi — hanya estimasi kasar untuk monitoring.

import { getModel } from './models';

// Estimasi kasar token consumption per generate (dengan riset web)
// berdasarkan rata-rata prompt system + user + respons JSON.
const TOKEN_ESTIMATES = {
  research: { input: 2500, output: 1200 },
  generate: { input: 4000, output: 3000 },
  generateFromImage: { input: 5000, output: 3000 },
  videoResearch: { input: 2500, output: 1200 },
  videoGenerate: { input: 4000, output: 3000 },
  videoGenerateFromImage: { input: 5000, output: 3000 },
  metadata: { input: 6000, output: 2000 },
  metadataFallback: { input: 600, output: 50 },
};

export function estimateCost(modelId, type, count = 1) {
  const m = getModel(modelId);
  if (!m) return 0;
  const est = TOKEN_ESTIMATES[type] || { input: 3000, output: 1500 };
  const inputTokens = est.input * count;
  const outputTokens = est.output * count;
  return (
    (inputTokens / 1_000_000) * m.price.input +
    (outputTokens / 1_000_000) * m.price.output
  );
}

export function formatUsd(amount) {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Hitung total cost dari array of items (each: { model, type, count })
export function totalCost(items) {
  return items.reduce((sum, item) => sum + estimateCost(item.model, item.type, item.count || 1), 0);
}