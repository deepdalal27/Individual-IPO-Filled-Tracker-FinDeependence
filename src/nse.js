// Pulls current + upcoming IPOs (with dates, price band and lot size)
// from NSE's public IPO endpoints and upserts them into the store.
const db = require('./db');

const BASE = 'https://www.nseindia.com/api';
const HEADERS = { 'User-Agent': 'ipo-filled-tracker/1.0', Accept: 'application/json' };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`NSE ${res.status} for ${url}`);
  return res.json();
}

// "29-Oct-2026" -> "2026-10-29"
function parseDate(s) {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s || '');
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${String(mm).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// "Rs. 78/- to Rs. 82/- per Equity Share" | "Rs.78 to Rs.82" | "Rs.100"
function parsePrice(s) {
  const nums = String(s || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return { low: null, high: null };
  const vals = nums.map(Number).filter((n) => n > 0);
  if (!vals.length) return { low: null, high: null };
  return { low: Math.min(...vals), high: Math.max(...vals) };
}

// "182 Equity Shares and in multiples thereof" -> 182
function parseLot(s) {
  const m = String(s || '').replace(/,/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function fetchDetail(symbol, series) {
  const d = await getJson(`${BASE}/ipo-detail?symbol=${encodeURIComponent(symbol)}&series=${encodeURIComponent(series)}`);
  const info = {};
  for (const row of d?.issueInfo?.dataList || []) {
    if (row && row.title) info[row.title.trim()] = row.value;
  }
  const period = String(info['Issue Period'] || '').split(/\s+to\s+/i);
  const price = parsePrice(info['Price Range']);
  return {
    name: d?.issueInfo?.dataList?.[0]?.title || null,
    openDate: parseDate(period[0]),
    closeDate: parseDate(period[1]),
    priceLow: price.low,
    priceHigh: price.high,
    lotSize: parseLot(info['Bid Lot'] || info['Minimum Order Quantity']),
  };
}

async function sync({ includeSme = process.env.INCLUDE_SME === '1' } = {}) {
  const state = db.load();
  const errors = [];
  const [current, upcoming] = await Promise.all([
    getJson(`${BASE}/ipo-current-issue`).catch((e) => { errors.push(e.message); return null; }),
    getJson(`${BASE}/all-upcoming-issues?category=ipo`).catch((e) => { errors.push(e.message); return null; }),
  ]);
  if (current == null && upcoming == null) {
    state.meta.lastSync = { at: new Date().toISOString(), added: 0, updated: 0, found: 0, errors, failed: true };
    db.save();
    throw new Error('Could not reach NSE: ' + errors.join('; '));
  }
  const seen = new Map();
  for (const r of [...(current || []), ...(upcoming || [])]) {
    if (!r || !r.symbol) continue;
    if (r.series !== 'EQ' && !(includeSme && r.series === 'SME')) continue;
    if (!seen.has(r.symbol)) seen.set(r.symbol, r);
  }

  let added = 0, updated = 0;
  for (const [symbol, r] of seen) {
    const base = {
      name: r.companyName,
      openDate: parseDate(r.issueStartDate),
      closeDate: parseDate(r.issueEndDate),
      ...(r.issuePrice ? (() => { const p = parsePrice(r.issuePrice); return { priceLow: p.low, priceHigh: p.high }; })() : {}),
    };
    let detail = {};
    try {
      detail = await fetchDetail(symbol, r.series);
    } catch (e) {
      errors.push(`${symbol}: ${e.message}`);
    }
    const fresh = { ...base };
    for (const [k, v] of Object.entries(detail)) if (v != null && v !== '') fresh[k] = v;
    fresh.name = r.companyName || fresh.name;

    let ipo = state.ipos.find((i) => i.symbol === symbol);
    if (!ipo) {
      ipo = { id: db.id(), symbol, type: r.series === 'SME' ? 'SME' : 'Mainboard', source: 'NSE', locked: false, createdAt: new Date().toISOString() };
      state.ipos.push(ipo);
      added++;
    } else {
      updated++;
    }
    for (const [k, v] of Object.entries(fresh)) {
      if (v == null) continue;
      // Manually edited IPOs keep their values; only blank fields get filled.
      if (ipo.locked && ipo[k] != null && ipo[k] !== '') continue;
      ipo[k] = v;
    }
    ipo.syncedAt = new Date().toISOString();
  }
  state.meta.lastSync = { at: new Date().toISOString(), added, updated, found: seen.size, errors };
  db.save();
  return state.meta.lastSync;
}

module.exports = { sync, parseDate, parsePrice, parseLot };
