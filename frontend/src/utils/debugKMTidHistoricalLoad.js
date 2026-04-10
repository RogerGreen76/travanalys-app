import { buildHistoricalKMTidDataset } from './buildHistoricalKMTidDataset';

export async function debugKMTidHistoricalLoad() {
  const dates = [
    '2026-04-08',
    '2026-04-09',
    '2026-04-10'
  ];

  console.log('[KM-TID] loading historical dataset for:', dates);

  const dataset = await buildHistoricalKMTidDataset(dates);

  const horseKeys = Object.keys(dataset || {});

  console.log('[KM-TID] horses loaded:', horseKeys.length);

  if (horseKeys[0]) {
    console.log('[KM-TID] sample horse:', dataset[horseKeys[0]]);
  }

  return dataset;
}
