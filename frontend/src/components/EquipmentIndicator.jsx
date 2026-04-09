import React from 'react';

const baseBadgeClass = 'px-2 py-0.5 rounded-full text-xs border border-slate-700 bg-slate-800 text-slate-200';

export const formatShoes = (shoes) => {
  if (shoes == null) return null;

  if (typeof shoes === 'object') {
    const frontHasShoe = shoes?.front?.hasShoe;
    const backHasShoe = shoes?.back?.hasShoe;
    if (frontHasShoe === false || backHasShoe === false) return 'Barfota';
    if (frontHasShoe === true || backHasShoe === true) return 'Skor';

    const typeText = String(shoes?.type?.text ?? shoes?.type?.engText ?? shoes?.type?.code ?? '').toLowerCase();
    if (/barfota|barefoot/.test(typeText)) return 'Barfota';
    if (typeText.trim()) return 'Skor';
  }

  const text = String(shoes).toLowerCase();
  if (!text.trim()) return null;
  if (/(barfota|bfro|bff|bfb|barefoot)/.test(text)) return 'Barfota';
  return 'Skor';
};

export const formatSulky = (sulky) => {
  if (sulky == null) return null;

  console.log('[EquipmentIndicator DEBUG] raw sulky:', sulky);

  const getFirstMeaningfulValue = (value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';

    const directValue = value?.type?.text ?? value?.type?.engText ?? value?.type?.code ?? value?.type ?? value?.text ?? value?.engText ?? value?.code;
    if (typeof directValue === 'string' && directValue.trim()) {
      return directValue;
    }

    for (const propValue of Object.values(value)) {
      if (typeof propValue === 'string' && propValue.trim()) {
        return propValue;
      }
      if (propValue && typeof propValue === 'object') {
        const nestedValue = getFirstMeaningfulValue(propValue);
        if (nestedValue) {
          return nestedValue;
        }
      }
    }

    return '';
  };

  const rawValue = getFirstMeaningfulValue(sulky);

  const value = String(rawValue || '').toLowerCase().trim();
  if (!value) return null;

  if (value.includes('american') || value.includes('bike')) return 'Bike';
  if (value.includes('hybrid')) return 'Hybrid';
  if (value.includes('standard') || value.includes('std')) return 'Vanlig vagn';

  return null;
};

export const EquipmentIndicator = ({ shoes, sulky }) => {
  const shoesLabel = formatShoes(shoes);
  const sulkyLabel = formatSulky(sulky);

  if (!shoesLabel && !sulkyLabel) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1.5 opacity-80">
      {shoesLabel && <span className={baseBadgeClass}>{shoesLabel}</span>}
      {sulkyLabel && <span className={baseBadgeClass}>{sulkyLabel}</span>}
    </div>
  );
};

export default EquipmentIndicator;
