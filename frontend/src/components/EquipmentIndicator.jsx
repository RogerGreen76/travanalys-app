import React from 'react';

/**
 * Parse equipment data from horse object
 * Returns front/rear barefoot status and sulky type
 */
const parseEquipmentData = (horse) => {
  const shoesText = String(
    horse?.shoes ??
    horse?.shoeInfo ??
    horse?.sko ??
    horse?.equipment?.shoes ??
    ''
  ).toLowerCase();

  const sulkyText = String(
    horse?.sulky ??
    horse?.vagn ??
    horse?.cart ??
    horse?.bike ??
    horse?.equipment?.sulky ??
    ''
  ).toLowerCase();

  const combined = `${shoesText} ${sulkyText}`;
  
  // DEBUG: Log what we're parsing (first call per render)
  if (!parseEquipmentData.debugLogged) {
    console.log('[EquipmentIndicator DEBUG] Parsing equipment for', horse?.name, {
      shoesText,
      sulkyText,
      combined,
      hasData: combined.trim().length > 0
    });
    parseEquipmentData.debugLogged = true;
  }
  
  // Empty if no data
  if (!combined.trim()) {
    return null;
  }

  // Determine shoe configuration (front and rear)
  const isBarefootAllAround = /(barfota\s*runt\s*om|bfro|all\s*bfro)/.test(combined);
  const isBarefootFront = /(barfota\s*fram|bf\s*fram|bff)/.test(combined);
  const isBarefootRear = /(barfota\s*bak|bf\s*bak|bfb)/.test(combined);

  const frontBarefoot = isBarefootAllAround || isBarefootFront;
  const rearBarefoot = isBarefootAllAround || isBarefootRear;

  // Determine sulky type
  const isAmericanSulky = /(amerikansk|bike|j[aä]nkarvagn|american)/.test(combined);
  const sulkyType = isAmericanSulky ? 'BIKE' : 'STD';

  return {
    frontBarefoot,
    rearBarefoot,
    sulkyType,
    hasShoesData: shoesText.trim().length > 0,
  };
};

/**
 * Display shoe configuration (front/rear) and sulky type
 * Shoe symbols: ◯ = shod, ◯̶ = barefoot
 * Sulky: BIKE = American, STD = Standard
 */
export const EquipmentIndicator = ({ horse }) => {
  if (!horse) return null;

  const equipmentData = parseEquipmentData(horse);
  
  // Only show if we have shoe data
  if (!equipmentData || !equipmentData.hasShoesData) {
    return null;
  }

  const { frontBarefoot, rearBarefoot, sulkyType } = equipmentData;

  return (
    <div className="flex items-center gap-2.5 mt-1.5 opacity-75">
      {/* Shoe indicators */}
      <div className="flex items-center gap-1">
        {/* Front shoe */}
        <span 
          className={`text-xs font-bold leading-none ${
            frontBarefoot 
              ? 'line-through text-gray-600' 
              : 'text-gray-400'
          }`}
        >
          ◯
        </span>
        
        {/* Rear shoe */}
        <span 
          className={`text-xs font-bold leading-none ${
            rearBarefoot 
              ? 'line-through text-gray-600' 
              : 'text-gray-400'
          }`}
        >
          ◯
        </span>
      </div>

      {/* Sulky type badge */}
      <span className="text-xs font-semibold text-gray-500 bg-white/5 px-1.5 py-0.5 rounded whitespace-nowrap">
        {sulkyType}
      </span>
    </div>
  );
};

export default EquipmentIndicator;
