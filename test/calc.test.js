const test = require('node:test');
const assert = require('node:assert');
const { lotRange, computeApplication } = require('../src/calc');
const { parseDate, parsePrice, parseLot } = require('../src/nse');

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


test('SME needs at least 3 lots for HNI', () => {
  const sme = { type: 'SME', priceHigh: 94, lotSize: 1200 }; // 1 lot = 1,12,800
  assert.strictEqual(lotRange(sme, 'SHNI').min, 3);
  assert.strictEqual(lotRange(sme, 'SHNI').max, 8);
  assert.strictEqual(lotRange(sme, 'BHNI').min, 9);
});
