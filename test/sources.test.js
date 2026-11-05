const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseInvestorgain, parseIpopremium, nameKey, dayMon } = require('../src/sources');
const today = new Date('2026-11-05T08:00:00Z');
const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

test('investorgain live list rows', () => {
  const rows = parseInvestorgain(fx('investorgain-rows.html'), today);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(
    (({ name, exchange, type, priceHigh, lotSize, openDate, closeDate, allotmentDate, listingDate }) => ({ name, exchange, type, priceHigh, lotSize, openDate, closeDate, allotmentDate, listingDate }))(rows[0]),
    { name: 'Antala Industries', exchange: 'BSE SME', type: 'SME', priceHigh: 66, lotSize: 2000, openDate: '2026-10-29', closeDate: '2026-11-05', allotmentDate: '2026-11-06', listingDate: '2026-11-11' }
  );
  assert.strictEqual(rows[1].exchange, 'NSE SME');
});

test('ipopremium IPO page', () => {
  const p = parseIpopremium(fx('ipopremium-antala.html'), today);
  assert.strictEqual(p.name, 'Antala Industries Ltd');
  assert.strictEqual(p.exchange, 'BSE SME');
  assert.strictEqual(p.type, 'SME');
  assert.strictEqual(p.priceLow, 62);
  assert.strictEqual(p.priceHigh, 66);
  assert.strictEqual(p.lotSize, 2000);
  assert.strictEqual(p.openDate, '2026-10-29');
  assert.strictEqual(p.closeDate, '2026-11-05');
  assert.strictEqual(p.allotmentDate, '2026-11-06');
  assert.strictEqual(p.listingDate, '2026-11-11');
});

test('names match across sources', () => {
  assert.strictEqual(nameKey('Antala Industries Ltd (BSE SME)'), nameKey('Antala Industries'));
  assert.strictEqual(nameKey('Bombay Coated & Special Steels Ltd'), nameKey('Bombay Coated and Special Steels Limited'));
  assert.notStrictEqual(nameKey('HGS (India) Limited'), nameKey('Antala Industries'));
});

test('year is inferred for dates without a year', () => {
  assert.strictEqual(dayMon('2-Jan', today), '2027-01-02');
  assert.strictEqual(dayMon('Oct 29', today), '2026-10-29');
});

test('brackets in a company name are not taken as the exchange', () => {
  const html = '<span>Home</span><span>HGS (India) Limited (NSE SME)</span><span>Price Band</span><span>₹114-120</span><span>Lot Size</span><span>1200 shares</span>';
  const p = parseIpopremium(html, today);
  assert.strictEqual(p.exchange, 'NSE SME');
  assert.strictEqual(p.name, 'HGS (India) Limited');
});
