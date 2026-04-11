const { normalizeEstimationQueueRows } = require('../../../src/components/MES/PreSales/estimationQueueData.cjs');

describe('normalizeEstimationQueueRows', () => {
  test('returns payload when it is already an array', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(normalizeEstimationQueueRows(rows)).toEqual(rows);
  });

  test('extracts rows from object-shaped payload', () => {
    const payload = { inquiries: [{ id: 3 }] };
    expect(normalizeEstimationQueueRows(payload)).toEqual([{ id: 3 }]);
  });

  test('returns empty array for unsupported payload shapes', () => {
    expect(normalizeEstimationQueueRows(undefined)).toEqual([]);
    expect(normalizeEstimationQueueRows(null)).toEqual([]);
    expect(normalizeEstimationQueueRows({})).toEqual([]);
    expect(normalizeEstimationQueueRows({ inquiries: null })).toEqual([]);
  });
});
