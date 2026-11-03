// Run by GitHub Actions every 3 hours: pulls current + upcoming IPOs from NSE
// and merges them into site/ipos.json (past IPOs are kept).
const fs = require('fs');
const path = require('path');
const { fetchIpos } = require('../src/nse');

const FILE = path.join(__dirname, '..', 'site', 'ipos.json');

(async () => {
  const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { ipos: [] };
  const byId = new Map((old.ipos || []).map((i) => [i.id, i]));
  let result;
  try {
    result = await fetchIpos({ includeSme: process.env.INCLUDE_SME === '1' });
  } catch (e) {
    console.error('NSE fetch failed:', e.message);
    process.exitCode = 0; // keep the existing list; try again next run
    return;
  }
  let changed = false;
  for (const ipo of result.ipos) {
    const prev = byId.get(ipo.id) || {};
    const merged = { ...prev };
    for (const [k, v] of Object.entries(ipo)) if (v != null && v !== '') merged[k] = v;
    const cmp = (o) => JSON.stringify({ ...o, syncedAt: undefined });
    if (cmp(merged) !== cmp(prev)) { merged.syncedAt = new Date().toISOString(); changed = true; }
    byId.set(ipo.id, merged);
  }
  const ipos = [...byId.values()].sort((a, b) => String(b.openDate || '').localeCompare(String(a.openDate || '')));
  const out = { updatedAt: new Date().toISOString(), source: 'NSE', errors: result.errors, ipos };
  if (changed || !fs.existsSync(FILE) || (old.ipos || []).length !== ipos.length) {
    fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
    console.log(`Updated ipos.json: ${ipos.length} IPOs (${result.ipos.length} active on NSE)`);
  } else {
    console.log(`No IPO changes (${result.ipos.length} active on NSE)`);
  }
})();
