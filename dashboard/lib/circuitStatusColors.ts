export type Confidence = 'confirmed' | 'corrected' | 'uncertain' | null;

export const circuitStatusColors = {
  unconnected: { fill: '#f8fafc', stroke: '#cbd5e1', text: '#64748b', tailwind: 'border-slate-200 bg-slate-50 text-slate-700' },
  connected: { fill: '#ecfdf5', stroke: '#34d399', text: '#047857', tailwind: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  fault: { fill: '#fef2f2', stroke: '#ef4444', text: '#b91c1c', tailwind: 'border-red-200 bg-red-50 text-red-800' },
  corrected: { fill: '#fffbeb', stroke: '#f59e0b', text: '#b45309', tailwind: 'border-amber-200 bg-amber-50 text-amber-800' },
  uncertain: { fill: '#ffffff', stroke: '#94a3b8', text: '#475569', tailwind: 'border-slate-300 bg-white text-slate-600' }
} as const;

export function paletteForResult(ok: boolean, confidence: Confidence) {
  if (ok) return circuitStatusColors.connected;
  if (confidence === 'corrected') return circuitStatusColors.corrected;
  if (confidence === 'uncertain') return circuitStatusColors.uncertain;
  return circuitStatusColors.fault;
}

export function badgeClassForConfidence(confidence: Confidence) {
  if (confidence === 'confirmed') return 'border-red-200 bg-red-600 text-white';
  if (confidence === 'corrected') return 'border-amber-200 bg-amber-100 text-amber-800';
  return 'border-slate-300 bg-white text-slate-600';
}
