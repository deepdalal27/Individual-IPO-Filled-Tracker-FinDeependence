// Extra IPO sources for BSE SME / BSE-only issues that NSE's feed does not list.
//  - ipopremium.in: individual IPO pages (/view/ipo/<id>/<slug>), allowed by its robots.txt. Its homepage and
//    sitemap sit behind a Cloudflare check, so new IPOs are found by trying the next page numbers. If a page
//    shows the bot check, it is skipped (never bypassed).
//  - investorgain.com: live IPO list table (robots.txt allows it), used to find IPOs and fill gaps.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (ipo calendar)', Accept: 'text/html' };
const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

async function getText(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const body = await r.text();
  const wall = /<title>\s*Just a moment|cf-chl|challenge-platform/i.test(body.slice(0, 6000));
  return { status: r.status, body, wall, url: r.url };
}
const decode = (s) => String(s || '').replace(/&#8377;/g, '₹').replace(/&ndash;|&#8211;/g, '-').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, ' | ').replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ').replace(/(\|\s*)+/g, '| ').trim();
const num = (s) => { const n = parseFloat(String(s || '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

// "29-Oct" / "Oct 29" / "Oct 29, 2026" -> ISO date, choosing the year closest to today.
function dayMon(s, today = new Date()) {
  const str = String(s || '');
  let m = str.match(/(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*(?:[\s,-]+(\d{4}))?/) || null, d, mon, y;
  if (m) { d = +m[1]; mon = MON[m[2].toUpperCase()]; y = m[3] && +m[3]; }
  else { m = str.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?/); if (!m) return null; mon = MON[m[1].toUpperCase()]; d = +m[2]; y = m[3] && +m[3]; }
  if (!mon || !d) return null;
  if (!y) {
    const ty = today.getUTCFullYear();
    const cands = [ty - 1, ty, ty + 1].map((yy) => ({ yy, t: Date.UTC(yy, mon - 1, d) }));
    y = cands.sort((a, b) => Math.abs(a.t - today.getTime()) - Math.abs(b.t - today.getTime()))[0].yy;
  }
  return `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const typeOf = (exch) => (/SME/i.test(exch || '') ? 'SME' : 'Mainboard');
const cleanName = (s) => String(s || '').replace(/\s*\((?:BSE SME|NSE SME|BSE|NSE|MAINBOARD)\)/gi, '').replace(/\s+IPO\b.*$/i, '').trim();

// ---------- investorgain live list ----------
function parseInvestorgain(html, today = new Date()) {
  const out = [];
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1];
    if (!/data-label="Name"/.test(row)) continue;
    const cell = (label) => { const c = row.match(new RegExp(`data-label="${label}"[^>]*>([\\s\\S]*?)<\\/td>`, 'i')); return c ? c[1] : ''; };
    const nameCell = cell('Name');
    const a = nameCell.match(/<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/i) || nameCell.match(/<a[^>]*title="([^"]+)"[^>]*href="([^"]+)"/i);
    const badges = [...nameCell.matchAll(/<span[^>]*badge[^>]*>([^<]+)<\/span>/gi)].map((b) => b[1].trim());
    const name = decode(a ? (a[2] && !a[2].startsWith('/') ? a[2] : a[1]) : text(nameCell)).trim();
    if (!name) continue;
    const exch = badges.find((b) => /SME|BSE|NSE|Mainboard/i.test(b)) || 'Mainboard';
    const first = (label) => text(cell(label)).split('|').map((x) => x.trim()).filter(Boolean)[0] || '';
    out.push({
      name, exchange: exch, type: typeOf(exch), statusCode: badges.find((b) => /^[A-Z]{1,2}$/.test(b)) || '',
      priceHigh: num(first('Price \\(₹\\)')), lotSize: num(first('Lot')),
      openDate: dayMon(first('Open'), today), closeDate: dayMon(first('Close'), today),
      allotmentDate: dayMon(first('BoA Dt'), today), listingDate: dayMon(first('Listing'), today),
      igUrl: a ? 'https://www.investorgain.com' + (a[1].startsWith('/') ? a[1] : a[2]) : null,
    });
  }
  return out;
}
async function fetchInvestorgain(today = new Date()) {
  const r = await getText('https://www.investorgain.com/report/live-ipo-gmp/331/');
  if (r.status !== 200 || r.wall) throw new Error(`investorgain ${r.status}${r.wall ? ' (bot check)' : ''}`);
  return parseInvestorgain(r.body, today);
}

// ---------- ipopremium IPO page ----------
function parseIpopremium(html, today = new Date()) {
  const t = text(html);
  if (!/Price Band/i.test(t) || !/Lot Size/i.test(t)) return null;
  const h = (t.match(/\| ([^|]{3,120}?\((?:BSE SME|NSE SME|MAINBOARD|BSE|NSE)\)) \|/i) || [])[1] || '';
  let name = cleanName(h);
  if (!name) { const ld = html.match(/"@type":"ListItem","position":2,"name":"([^"]+)"/); name = cleanName(ld && ld[1]); }
  const exch = ((h.match(/\((BSE SME|NSE SME|MAINBOARD|BSE|NSE)\)\s*$/i) || [])[1] || '').toUpperCase().replace('MAINBOARD', 'Mainboard');
  const band = t.match(/Price Band \| ₹?\s*([\d.,]+)\s*-\s*([\d.,]+)/i) || t.match(/Price Band \| ₹?\s*([\d.,]+)/i);
  const lot = t.match(/Lot Size \| ([\d,]+) shares/i);
  const stage = (label) => { const m = t.match(new RegExp(`\\| ${label} \\| ([A-Za-z]{3} \\d{1,2}(?:, \\d{4})?) \\|`, 'i')); return m ? dayMon(m[1], today) : null; };
  let registrar = null;
  for (const m of t.matchAll(/Registrar \| ([^|]{4,90})/gi)) { if (/(Limited|Ltd|Pvt|Private|Services|Technologies|Registry|Intime)/i.test(m[1]) && !/Subscription/i.test(m[1])) { registrar = m[1].trim(); break; } }
  return {
    name, exchange: exch || '', type: typeOf(exch),
    priceLow: band ? num(band[1]) : null, priceHigh: band ? num(band[2] || band[1]) : null,
    lotSize: lot ? num(lot[1]) : null,
    openDate: stage('Open'), closeDate: stage('Close'), allotmentDate: stage('Allotment'), listingDate: stage('Listing'),
    registrar,
  };
}
async function fetchIpopremium(id, slug = 'ipo', today = new Date()) {
  const url = `https://www.ipopremium.in/view/ipo/${id}/${slug}`;
  const r = await getText(url);
  if (r.wall) return { blocked: true };
  if (r.status !== 200) return { missing: r.status === 404 || r.status === 410, status: r.status };
  const p = parseIpopremium(r.body, today);
  if (!p) return { missing: true };
  const realSlug = (r.url.match(/\/view\/ipo\/\d+\/([^/?#]+)/) || [])[1] || slug;
  return { ipo: { ...p, ippId: id, ippSlug: realSlug, ippUrl: `https://www.ipopremium.in/view/ipo/${id}/${realSlug}` } };
}

// Normalised name for matching the same IPO across sources.
const STOP = new Set(['LIMITED', 'LTD', 'PVT', 'PRIVATE', 'IPO', 'SME', 'THE', 'AND', 'OF', 'CO', 'COMPANY', 'INDIA']);
const nameKey = (s) => cleanName(s).toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

module.exports = { parseInvestorgain, fetchInvestorgain, parseIpopremium, fetchIpopremium, nameKey, dayMon };
