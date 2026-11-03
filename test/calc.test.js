const test = require('node:test');
const assert = require('node:assert');
const { lotRange, computeApplication } = require('../src/calc');
const { parseDate, parsePrice, parseLot } = require('../src/nse');
const { buildReport } = require('../src/report');

const ipo = { id: 'i1', name: 'Test', priceLow: 78, priceHigh: 82, lotSize: 182 }; // 1 lot = 14,924

test('sHNI / bHNI lot ranges at upper price band', () => {
  assert.deepStrictEqual(lotRange(ipo, 'SHNI'), { min: 14, max: 67 }); // 14*14924 = 2,08,936 ; 67*14924 = 9,99,908
  assert.deepStrictEqual(lotRange(ipo, 'BHNI'), { min: 68, max: null }); // 68*14924 = 10,14,832
});

test('exactly Rs 2 lakh stays retail, next lot is sHNI', () => {
  const r = lotRange({ priceHigh: 100, lotSize: 200 }, 'SHNI'); // 1 lot = 20,000 -> 10 lots = 2,00,000
  assert.strictEqual(r.min, 11);
  assert.strictEqual(r.max, 50);
  assert.strictEqual(lotRange({ priceHigh: 100, lotSize: 200 }, 'BHNI').min, 51);
});

test('computeApplication defaults to minimum and honours valid overrides', () => {
  assert.deepStrictEqual(
    (({ lots, shares, amount }) => ({ lots, shares, amount }))(computeApplication(ipo, { category: 'SHNI' })),
    { lots: 14, shares: 2548, amount: 208936 }
  );
  assert.strictEqual(computeApplication(ipo, { category: 'SHNI', lots: 20 }).lots, 20);
  assert.strictEqual(computeApplication(ipo, { category: 'SHNI', lots: 5 }).lots, 14); // below min -> min
  assert.strictEqual(computeApplication(ipo, { category: 'BHNI' }).amount, 68 * 182 * 82);
  assert.strictEqual(computeApplication({ name: 'x' }, { category: 'BHNI' }).amount, null);
});

test('NSE field parsers', () => {
  assert.strictEqual(parseDate('29-Oct-2026'), '2026-10-29');
  assert.deepStrictEqual(parsePrice('Rs. 78/- to Rs. 82/- per Equity Share'), { low: 78, high: 82 });
  assert.deepStrictEqual(parsePrice('Rs.1,045 to Rs.1,100'), { low: 1045, high: 1100 });
  assert.strictEqual(parseLot('182 Equity Shares and in multiples thereof'), 182);
});

test('report totals', () => {
  const state = {
    accounts: [{ id: 'a1', name: 'A', order: 1 }, { id: 'a2', name: 'B', order: 2 }, { id: 'a3', name: 'C', order: 3 }],
    ipos: [{ ...ipo, openDate: '2026-10-29', closeDate: '2026-11-02' }],
    applications: [
      { ipoId: 'i1', accountId: 'a1', category: 'SHNI' },
      { ipoId: 'i1', accountId: 'a2', category: 'BHNI' },
      { ipoId: 'i1', accountId: 'a3', category: null },
    ],
  };
  const r = buildReport(state, {});
  assert.strictEqual(r.blocks.length, 1);
  assert.deepStrictEqual(r.grand, { accounts: 2, shni: 1, bhni: 1, lots: 82, shares: 82 * 182, amount: 82 * 182 * 82 });
  assert.strictEqual(buildReport(state, { category: 'BHNI' }).grand.lots, 68);
  assert.strictEqual(buildReport(state, { from: '2026-11-03' }).blocks.length, 0);
});
