/**
 * Standalone KM-tid parser utility for testing.
 * Input: raw JavaScript text from /api/kmtid/{date} containing "const toplist = { ... }".
 */

const TOPLIST_ASSIGNMENT_RE = /\b(?:const|let|var)\s+toplist\s*=\s*/;

const TARGET_KEYS = [
  'horseName',
  'driverName',
  'startNumber',
  'result',
  'first200ms',
  'first200',
  'last200ms',
  'last200',
  'best100ms',
  'best100',
  'actualKMTime',
  'slipstreamDistance'
];

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toStringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length ? text : null;
}

function buildDriverName(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (typeof entry.driverName === 'string' && entry.driverName.trim()) {
    return entry.driverName.trim();
  }

  if (typeof entry.driver === 'string' && entry.driver.trim()) {
    return entry.driver.trim();
  }

  const driverObj = entry.driver;
  if (driverObj && typeof driverObj === 'object') {
    if (typeof driverObj.name === 'string' && driverObj.name.trim()) {
      return driverObj.name.trim();
    }

    const firstName = typeof driverObj.firstName === 'string' ? driverObj.firstName.trim() : '';
    const lastName = typeof driverObj.lastName === 'string' ? driverObj.lastName.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) {
      return fullName;
    }
  }

  return null;
}

function firstDefined(entry, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(entry, key) && entry[key] !== undefined) {
      return entry[key];
    }
  }

  return undefined;
}

function findBalancedObjectLiteralStart(rawText, startIndex) {
  for (let i = startIndex; i < rawText.length; i += 1) {
    if (rawText[i] === '{') {
      return i;
    }
  }

  return -1;
}

function extractBalancedObjectLiteral(rawText, objectStartIndex) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = objectStartIndex; i < rawText.length; i += 1) {
    const ch = rawText[i];
    const next = rawText[i + 1];
    const prev = rawText[i - 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (prev === '*' && ch === '/') {
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === '\'' && prev !== '\\') {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"' && prev !== '\\') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplate) {
      if (ch === '`' && prev !== '\\') {
        inTemplate = false;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (ch === '\'') {
      inSingleQuote = true;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return rawText.slice(objectStartIndex, i + 1);
      }
    }
  }

  return null;
}

function evaluateObjectLiteral(objectLiteralText) {
  return Function(`"use strict"; return (${objectLiteralText});`)();
}

function collectCandidateEntries(node, acc = []) {
  if (!node) {
    return acc;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectCandidateEntries(item, acc);
    }
    return acc;
  }

  if (typeof node !== 'object') {
    return acc;
  }

  const keys = Object.keys(node);
  const hasTargetField = TARGET_KEYS.some(key => Object.prototype.hasOwnProperty.call(node, key));

  if (hasTargetField) {
    acc.push(node);
  }

  for (const key of keys) {
    collectCandidateEntries(node[key], acc);
  }

  return acc;
}

function normalizeTimingEntry(entry) {
  const horseName = toStringOrNull(
    firstDefined(entry, ['horseName', 'horse', 'name', 'horse_name'])
  );

  const driverName = buildDriverName(entry);

  const normalized = {
    horseName,
    driverName,
    startNumber: parseNumber(firstDefined(entry, ['startNumber', 'startNo', 'number', 'start'])),
    result: parseNumber(firstDefined(entry, ['result', 'position', 'placering'])),
    first200ms: parseNumber(firstDefined(entry, ['first200ms', 'first200Ms', 'first200_ms'])),
    first200: toStringOrNull(firstDefined(entry, ['first200', 'first_200'])),
    last200ms: parseNumber(firstDefined(entry, ['last200ms', 'last200Ms', 'last200_ms'])),
    last200: toStringOrNull(firstDefined(entry, ['last200', 'last_200'])),
    best100ms: parseNumber(firstDefined(entry, ['best100ms', 'best100Ms', 'best100_ms'])),
    best100: toStringOrNull(firstDefined(entry, ['best100', 'best_100'])),
    actualKMTime: toStringOrNull(firstDefined(entry, ['actualKMTime', 'actualKmTime', 'kmTime'])),
    slipstreamDistance: parseNumber(
      firstDefined(entry, ['slipstreamDistance', 'slipstream', 'slipstream_distance'])
    )
  };

  const hasUsefulIdentity = normalized.horseName || normalized.startNumber !== null;
  return hasUsefulIdentity ? normalized : null;
}

/**
 * Parse raw KM-tid races.js text and return the toplist object.
 * @param {string} rawText
 * @returns {object}
 */
export function parseKMTidToplistObject(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('KM-tid raw text must be a non-empty string.');
  }

  const match = TOPLIST_ASSIGNMENT_RE.exec(rawText);
  if (!match) {
    throw new Error('Could not find "toplist" assignment in KM-tid raw text.');
  }

  const assignmentEndIndex = match.index + match[0].length;
  const objectStartIndex = findBalancedObjectLiteralStart(rawText, assignmentEndIndex);

  if (objectStartIndex < 0) {
    throw new Error('Could not find object literal start for "toplist".');
  }

  const objectLiteralText = extractBalancedObjectLiteral(rawText, objectStartIndex);
  if (!objectLiteralText) {
    throw new Error('Failed to extract balanced object literal for "toplist".');
  }

  const toplist = evaluateObjectLiteral(objectLiteralText);

  if (!toplist || typeof toplist !== 'object' || Array.isArray(toplist)) {
    throw new Error('Parsed "toplist" is not an object.');
  }

  return toplist;
}

/**
 * Extract normalized timing entries from raw KM-tid races.js text.
 * @param {string} rawText
 * @returns {Array<object>}
 */
export function extractKMTidTimingEntries(rawText) {
  const toplist = parseKMTidToplistObject(rawText);
  const candidates = collectCandidateEntries(toplist);

  const normalized = candidates
    .map(normalizeTimingEntry)
    .filter(entry => entry !== null);

  const seen = new Set();
  const deduped = [];

  for (const item of normalized) {
    const key = [
      item.horseName || '',
      item.startNumber ?? '',
      item.result ?? '',
      item.actualKMTime || ''
    ].join('|');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export default {
  parseKMTidToplistObject,
  extractKMTidTimingEntries
};
