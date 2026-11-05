// Run by GitHub Actions (about twice an hour): collects current and upcoming IPOs and merges them into
// site/ipos.json (past IPOs are kept).
//   1. NSE's public IPO feed (mainboard + SME listed on NSE) - primary source
//   2. ipopremium.in IPO pages - adds BSE SME / BSE-only IPOs (price band, lot, dates, registrar)
//   3. investorgain.com live list - finds anything still missing
const fs = require('fs');
const path = require('path');
const { fetchIpos, fetchDetail } = require('../src/nse');
const { fetchInvestorgain, fetchIpopremium, nameKey } = require('../src/sources');

const FILE = path.join(__dirname, '..', 'site', 'ipos.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDaysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const SEED_IPP_IDS = [1421, 1422, 1423, 1424, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432]; // from ipopremium's IPO list

(async () => {
  const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { ipos: [] };
  const byId = new Map((old.ipos || []).map((i) => [i.id, i]));
  const meta = { ...(old.meta || {}) };
  const errors = [];
  let changed = false;
  const cutoff = isoDaysAgo(25);

  // Same IPO from another source: identical name key, or same issue dates with the same first two name words
  // (e.g. "Maxwell Engineering Solutions Limited" on NSE vs "Maxwell Engineering Ltd." elsewhere).
  const findSame = (name, f = {}) => {
    const k = nameKey(name); if (!k) return null;
    const head = k.split(' ').slice(0, 2).join(' ');
    return [...byId.values()].find((i) => nameKey(i.name) === k)
      || (f.openDate && f.closeDate ? [...byId.values()].find((i) => i.openDate === f.openDate && i.closeDate === f.closeDate && nameKey(i.name).split(' ').slice(0, 2).join(' ') === head) : null);
  };
  // source rank: NSE wins over ipopremium, which wins over investorgain
  const RANK = { NSE: 3, ipopremium: 2, investorgain: 1 };
  function upsert(id, src, fields) {
    let cur = byId.get(id) || findSame(fields.name, fields);
    if (!cur) { cur = { id, source: src }; byId.set(id, cur); changed = true; }
    const mine = RANK[src] >= (RANK[cur.source] || 0);
    const before = JSON.stringify(cur);
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === '') continue;
      if (k === 'name' && cur.name && !mine) continue;
      if (mine || cur[k] == null || cur[k] === '') cur[k] = v;
    }
    if (mine) cur.source = src;
    if (JSON.stringify(cur) !== before) { cur.syncedAt = new Date().toISOString(); changed = true; }
    return cur;
  }

  // 1. NSE
  try {
    const r = await fetchIpos({ includeSme: process.env.INCLUDE_SME !== '0' });
    errors.push(...r.errors);
    for (const ipo of r.ipos) upsert(ipo.id, 'NSE', { ...ipo, exchange: ipo.type === 'SME' ? 'NSE SME' : 'NSE, BSE' });
    console.log(`NSE: ${r.ipos.length} active`);
  } catch (e) { errors.push('NSE: ' + e.message); console.error('NSE failed:', e.message); }

  // registrar backfill for recent NSE IPOs
  for (const ipo of byId.values()) {
    if (ipo.registrar || ipo.source !== 'NSE' || !ipo.symbol || (ipo.closeDate || '') < cutoff) continue;
    try { const d = await fetchDetail(ipo.symbol, ipo.type === 'SME' ? 'SME' : 'EQ'); if (d.registrar) { ipo.registrar = d.registrar; changed = true; } } catch { /* next run */ }
  }

  // 2. ipopremium: refresh recent IPO pages, then try the next page numbers for new IPOs
  try {
    const known = [...byId.values()].filter((i) => i.ippId && (i.closeDate || '9999') >= cutoff).map((i) => i.ippId);
    const ids = [...new Set([...(known.length ? known : SEED_IPP_IDS)])];
    let maxId = Math.max(meta.ippMaxId || 0, ...SEED_IPP_IDS, ...[...byId.values()].map((i) => i.ippId || 0));
    let blocked = false, found = 0;
    const take = (res) => {
      const p = res.ipo;
      if (!p.name || ((p.closeDate || '9999') < cutoff)) return false;
      upsert(`ipp-${p.ippId}`, 'ipopremium', p); found++; return true;
    };
    for (const id of ids) {
      const res = await fetchIpopremium(id);
      if (res.blocked) { blocked = true; break; }
      if (res.ipo) take(res);
      await sleep(1200);
    }
    if (!blocked) {
      let misses = 0;
      for (let id = maxId + 1; misses < 3 && id <= maxId + 10; id++) {
        const res = await fetchIpopremium(id);
        if (res.blocked) { blocked = true; break; }
        if (res.ipo) { misses = 0; meta.ippMaxId = Math.max(meta.ippMaxId || 0, id); take(res); } else misses++;
        await sleep(1200);
      }
    }
    if (blocked) errors.push('ipopremium: bot check shown, skipped this run');
    console.log(`ipopremium: ${found} recent IPO pages read${blocked ? ' (stopped: bot check)' : ''}`);
  } catch (e) { errors.push('ipopremium: ' + e.message); console.error('ipopremium failed:', e.message); }

  // 3. investorgain: fill in anything still missing
  try {
    const rows = await fetchInvestorgain();
    let n = 0;
    for (const r of rows) {
      if ((r.closeDate || '9999') < cutoff || !r.name) continue;
      const slug = nameKey(r.name).toLowerCase().replace(/\s+/g, '-');
      upsert(`ig-${slug}`, 'investorgain', r); n++;
    }
    console.log(`investorgain: ${n} recent IPOs`);
  } catch (e) { errors.push('investorgain: ' + e.message); console.error('investorgain failed:', e.message); }

  const ipos = [...byId.values()].sort((a, b) => String(b.openDate || '').localeCompare(String(a.openDate || '')));
  const out = { updatedAt: new Date().toISOString(), sources: ['NSE', 'ipopremium.in', 'investorgain.com'], errors, meta, ipos };
  if (changed || !fs.existsSync(FILE) || JSON.stringify(meta) !== JSON.stringify(old.meta || {})) {
    fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
    console.log(`Updated ipos.json: ${ipos.length} IPOs`);
  } else {
    console.log('No IPO changes');
  }
  // Always refresh the "last checked" note (deployed with the site, not committed).
  fs.writeFileSync(path.join(__dirname, '..', 'site', 'status.json'), JSON.stringify({ checkedAt: new Date().toISOString(), errors, count: ipos.length }) + '\n');
  if (errors.length) console.log('Notes: ' + errors.join(' | '));
})();
