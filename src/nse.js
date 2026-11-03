// Reads current + upcoming IPOs (dates, price band, lot size) from NSE's public IPO endpoints.
const BASE = 'https://www.nseindia.com/api';
const HEADERS = { 'User-Agent': 'findeependence-ipo-ledger/1.0', Accept: 'application/json' };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`NSE ${res.status} for ${url}`);
  return res.json();
}

// "29-Oct-2026" -> "2026-10-29"
function parseDate(s) {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s || '');
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// "Rs. 78/- to Rs. 82/- per Equity Share" | "Rs.1,045 to Rs.1,100"
function parsePrice(s) {
  const vals = (String(s || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0);
  return vals.length ? { low: Math.min(...vals), high: Math.max(...vals) } : { low: null, high: null };
}

// "182 Equity Shares and in multiples thereof" -> 182
function parseLot(s) {
  const m = String(s || '').replace(/,/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function fetchDetail(symbol, series) {
  const d = await getJson(`${BASE}/ipo-detail?symbol=${encodeURIComponent(symbol)}&series=${encodeURIComponent(series)}`);
  const info = {};
  for (const row of d?.issueInfo?.dataList || []) if (row && row.title) info[row.title.trim()] = row.value;
  const period = String(info['Issue Period'] || '').split(/\s+to\s+/i);
  const price = parsePrice(info['Price Range']);
  return {
    openDate: parseDate(period[0]), closeDate: parseDate(period[1]),
    priceLow: price.low, priceHigh: price.high,
    lotSize: parseLot(info['Bid Lot'] || info['Minimum Order Quantity']),
  };
}

async function fetchIpos({ includeSme = false } = {}) {
  const errors = [];
  const [current, upcoming] = await Promise.all([
    getJson(`${BASE}/ipo-current-issue`).catch((e) => { errors.push(e.message); return null; }),
    getJson(`${BASE}/all-upcoming-issues?category=ipo`).catch((e) => { errors.push(e.message); return null; }),
  ]);
  if (current == null && upcoming == null) throw new Error('Could not reach NSE: ' + errors.join('; '));
  const seen = new Map();
  for (const r of [...(current || []), ...(upcoming || [])]) {
    if (!r || !r.symbol || seen.has(r.symbol)) continue;
    if (r.series !== 'EQ' && !(includeSme && r.series === 'SME')) continue;
    seen.set(r.symbol, r);
  }
  const ipos = [];
  for (const [symbol, r] of seen) {
    const p = parsePrice(r.issuePrice);
    let detail = {};
    try { detail = await fetchDetail(symbol, r.series); } catch (e) { errors.push(`${symbol}: ${e.message}`); }
    const ipo = {
      id: `nse-${symbol}`, symbol, name: r.companyName, type: r.series === 'SME' ? 'SME' : 'Mainboard', source: 'NSE',
      openDate: parseDate(r.issueStartDate), closeDate: parseDate(r.issueEndDate), priceLow: p.low, priceHigh: p.high, lotSize: null,
    };
    for (const [k, v] of Object.entries(detail)) if (v != null) ipo[k] = v;
    ipos.push(ipo);
  }
  return { ipos, errors };
}

module.exports = { fetchIpos, parseDate, parsePrice, parseLot };
