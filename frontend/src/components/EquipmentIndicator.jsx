import React from 'react';

const neutralBadgeClass = 'px-2 py-0.5 rounded-full text-xs border border-slate-700 bg-slate-800 text-slate-200';
const changedBadgeClass = 'px-2 py-0.5 rounded-full text-xs border border-amber-500/40 bg-amber-500/10 text-amber-300';

const hasChangeSignal = (value) => {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    return ['true', 'changed', 'change', 'yes', 'new'].includes(normalized);
  }
  if (typeof value === 'object') {
    return Object.values(value).some(hasChangeSignal);
  }
  return false;
};

const getEquipmentChangeFlags = (horse, shoes, sulky) => {
  const globalChange = hasChangeSignal(
    horse?.equipmentChange ?? horse?.changedEquipment ?? horse?.equipmentChanged ?? null
  );

  const hasShoesChange = globalChange || hasChangeSignal(
    horse?.shoesChange ?? horse?.shoeChange ?? shoes?.changed ?? shoes?.front?.changed ?? shoes?.back?.changed
  );

  const hasSulkyChange = globalChange || hasChangeSignal(
    horse?.sulkyChange ?? horse?.cartChange ?? horse?.bikeChange ?? sulky?.changed ?? sulky?.type?.changed
  );

  return { hasShoesChange, hasSulkyChange };
};

export const extractShoeState = (value) => {
  if (value == null) return null;

  if (typeof value === 'boolean') {
    return value ? 'shoes' : 'barefoot';
  }

  if (typeof value === 'object') {
    if (typeof value?.hasShoe === 'boolean') {
      return value.hasShoe ? 'shoes' : 'barefoot';
    }

    const nestedString = value?.type ?? value?.text ?? value?.code ?? null;
    if (nestedString != null) {
      return extractShoeState(nestedString);
    }
  }

  const text = String(value).toLowerCase().trim();
  if (!text) return null;
  if (/(barfota|barefoot|utan\s*skor)/.test(text)) return 'barefoot';
  if (/(shoe|shoes|skor|sko|beskod|beskodd|med\s*skor)/.test(text)) return 'shoes';

  return null;
};

export const formatShoes = (shoes) => {
  if (shoes == null) return null;

  if (typeof shoes === 'string') {
    const text = shoes.toLowerCase().trim();
    if (!text) return null;
    if (/(barfota\s*runt\s*om|bfro|barefoot\s*all\s*around)/.test(text)) return 'Barfota';
    if (/(barfota\s*fram|bf\s*fram|bff)/.test(text)) return 'Barfota fram';
    if (/(barfota\s*bak|bf\s*bak|bfb)/.test(text)) return 'Barfota bak';
    if (/(skor\s*runt\s*om|beskod|beskodd|med\s*skor)/.test(text)) return 'Skor';

    const wholeState = extractShoeState(text);
    if (wholeState === 'barefoot') return 'Barfota';
    if (wholeState === 'shoes') return 'Skor';

    console.log('RAW SHOES', shoes);
    return null;
  }

  if (typeof shoes === 'object') {
    const frontState = extractShoeState(shoes?.front ?? shoes?.fore ?? shoes?.fram);
    const backState = extractShoeState(shoes?.back ?? shoes?.hind ?? shoes?.rear ?? shoes?.bak);

    if (frontState === 'barefoot' && backState === 'barefoot') return 'Barfota';
    if (frontState === 'barefoot' && backState === 'shoes') return 'Barfota fram';
    if (frontState === 'shoes' && backState === 'barefoot') return 'Barfota bak';
    if (frontState === 'shoes' && backState === 'shoes') return 'Skor';

    const wholeState = extractShoeState(shoes);
    if (wholeState === 'barefoot') return 'Barfota';
    if (wholeState === 'shoes') return 'Skor';

    console.log('RAW SHOES', shoes);
    return null;
  }

  console.log('RAW SHOES', shoes);
  return null;
};

export const extractSulkyValue = (sulky) => {
  if (sulky == null) return '';
  if (typeof sulky === 'string') return sulky;
  if (typeof sulky?.type === 'string') return sulky.type;
  if (typeof sulky?.code === 'string') return sulky.code;
  if (typeof sulky?.text === 'string') return sulky.text;

  for (const value of Object.values(sulky)) {
    if (typeof value === 'string') {
      return value;
    }
  }

  return JSON.stringify(sulky);
};

export const formatSulky = (sulky) => {
  if (sulky == null) return null;

  console.log('[EquipmentIndicator DEBUG] raw sulky:', sulky);

  const value = extractSulkyValue(sulky).toLowerCase().trim();
  if (!value) return null;

  if (value.includes('american') || value.includes('bike')) return 'Bike';
  return 'Vanlig';
};

export const EquipmentIndicator = ({ shoes, sulky, horse }) => {
  const shoesLabel = formatShoes(shoes);
  const sulkyLabel = formatSulky(sulky);
  const { hasShoesChange, hasSulkyChange } = getEquipmentChangeFlags(horse, shoes, sulky);
  const isMaxEquipment = shoesLabel === 'Barfota' && sulkyLabel === 'Bike';

  if (!shoesLabel && !sulkyLabel) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1.5 opacity-80">
      {shoesLabel && <span className={hasShoesChange ? changedBadgeClass : neutralBadgeClass}>{shoesLabel}</span>}
      {sulkyLabel && <span className={hasSulkyChange ? changedBadgeClass : neutralBadgeClass}>{sulkyLabel}</span>}
      {isMaxEquipment && (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
          MAX
        </span>
      )}
    </div>
  );
};

export default EquipmentIndicator;
