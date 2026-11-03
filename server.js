const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./src/db');
const nse = require('./src/nse');
const { CATEGORIES, lotRange, lotAmount, computeApplication, ipoStatus, istDate } = require('./src/calc');
const { buildReport, toExcel, toPdf } = require('./src/report');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SYNC_HOURS = Number(process.env.SYNC_INTERVAL_HOURS || 3);

const app = express();
app.use(express.json());

// Optional password protection (HTTP Basic auth). Any username works.
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const hdr = req.headers.authorization || '';
    const pass = Buffer.from(hdr.replace(/^Basic\s+/i, ''), 'base64').toString().split(':').slice(1).join(':');
    const a = Buffer.from(pass), b = Buffer.from(APP_PASSWORD);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="IPO Tracker"').status(401).send('Authentication required');
  });
}

app.use(express.static(path.join(__dirname, 'public')));

const decorate = (ipo) => ({
  ...ipo,
  status: ipoStatus(ipo),
  lotAmount: lotAmount(ipo),
  ranges: { SHNI: lotRange(ipo, 'SHNI'), BHNI: lotRange(ipo, 'BHNI') },
});

const num = (v) => (v === '' || v == null ? null : Number(v));
const bad = (res, msg) => res.status(400).json({ error: msg });

// ---------- State ----------
app.get('/api/state', (req, res) => {
  const s = db.load();
  const counts = {};
  for (const a of s.applications) if (a.category) counts[a.ipoId] = (counts[a.ipoId] || 0) + 1;
  const ipos = s.ipos
    .filter((i) => !i.archived)
    .map((i) => ({ ...decorate(i), appliedCount: counts[i.id] || 0 }))
    .sort((a, b) => (b.openDate || '9999').localeCompare(a.openDate || '9999'));
  res.json({ accounts: s.accounts.slice().sort((a, b) => a.order - b.order), ipos, meta: s.meta, today: istDate() });
});

// ---------- Accounts ----------
app.post('/api/accounts', (req, res) => {
  const s = db.load();
  const { name, pan = '', notes = '' } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, 'Name is required');
  const order = Math.max(0, ...s.accounts.map((a) => a.order || 0)) + 1;
  const acc = { id: db.id(), name: String(name).trim(), pan: String(pan).trim().toUpperCase(), notes, active: true, order };
  s.accounts.push(acc);
  db.save();
  res.json(acc);
});

app.put('/api/accounts/:id', (req, res) => {
  const s = db.load();
  const acc = s.accounts.find((a) => a.id === req.params.id);
  if (!acc) return res.status(404).json({ error: 'Not found' });
  const { name, pan, notes, active } = req.body || {};
  if (name !== undefined) { if (!String(name).trim()) return bad(res, 'Name is required'); acc.name = String(name).trim(); }
  if (pan !== undefined) acc.pan = String(pan).trim().toUpperCase();
  if (notes !== undefined) acc.notes = notes;
  if (active !== undefined) acc.active = !!active;
  db.save();
  res.json(acc);
});

app.delete('/api/accounts/:id', (req, res) => {
  const s = db.load();
  s.accounts = s.accounts.filter((a) => a.id !== req.params.id);
  s.applications = s.applications.filter((a) => a.accountId !== req.params.id);
  db.save();
  res.json({ ok: true });
});

// ---------- IPOs ----------
function applyIpoFields(ipo, body) {
  const fields = { name: String, symbol: (v) => String(v).trim().toUpperCase(), type: String, openDate: String, closeDate: String, priceLow: num, priceHigh: num, lotSize: num };
  for (const [k, conv] of Object.entries(fields)) if (body[k] !== undefined) ipo[k] = body[k] === '' ? null : conv(body[k]);
}

app.post('/api/ipos', (req, res) => {
  const s = db.load();
  if (!req.body?.name) return bad(res, 'IPO name is required');
  const ipo = { id: db.id(), source: 'Manual', locked: true, type: 'Mainboard', createdAt: new Date().toISOString() };
  applyIpoFields(ipo, req.body);
  s.ipos.push(ipo);
  db.save();
  res.json(decorate(ipo));
});

app.put('/api/ipos/:id', (req, res) => {
  const s = db.load();
  const ipo = s.ipos.find((i) => i.id === req.params.id);
  if (!ipo) return res.status(404).json({ error: 'Not found' });
  applyIpoFields(ipo, req.body || {});
  if (req.body?.archived !== undefined) ipo.archived = !!req.body.archived;
  ipo.locked = true; // keep manual edits from being overwritten by auto-sync
  db.save();
  res.json(decorate(ipo));
});

app.delete('/api/ipos/:id', (req, res) => {
  const s = db.load();
  s.ipos = s.ipos.filter((i) => i.id !== req.params.id);
  s.applications = s.applications.filter((a) => a.ipoId !== req.params.id);
  db.save();
  res.json({ ok: true });
});

app.post('/api/sync', async (req, res) => {
  try {
    res.json(await nse.sync());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Applications ----------
app.get('/api/ipos/:id/applications', (req, res) => {
  const s = db.load();
  const ipo = s.ipos.find((i) => i.id === req.params.id);
  if (!ipo) return res.status(404).json({ error: 'Not found' });
  const rows = s.accounts
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((acc) => {
      const appRec = s.applications.find((a) => a.ipoId === ipo.id && a.accountId === acc.id) || null;
      const calc = appRec && appRec.category ? computeApplication(ipo, appRec) : null;
      return { account: acc, application: appRec, calc };
    });
  res.json({ ipo: decorate(ipo), rows });
});

app.put('/api/applications', (req, res) => {
  const s = db.load();
  const { ipoId, accountId, category = null, lots, remarks } = req.body || {};
  const ipo = s.ipos.find((i) => i.id === ipoId);
  if (!ipo || !s.accounts.some((a) => a.id === accountId)) return bad(res, 'Unknown IPO or account');
  if (category && !CATEGORIES.includes(category)) return bad(res, 'Category must be SHNI or BHNI');
  let rec = s.applications.find((a) => a.ipoId === ipoId && a.accountId === accountId);
  if (!rec) {
    rec = { id: db.id(), ipoId, accountId, category: null, lots: null, remarks: '' };
    s.applications.push(rec);
  }
  if (category !== rec.category) rec.lots = null; // switching category resets to its minimum
  rec.category = category || null;
  if (lots !== undefined) {
    const n = num(lots);
    if (n != null && rec.category) {
      const r = lotRange(ipo, rec.category);
      if (r && (!Number.isInteger(n) || n < r.min || (r.max != null && n > r.max))) {
        return bad(res, `Lots for ${rec.category === 'SHNI' ? 'sHNI' : 'bHNI'} must be ${r.min}${r.max != null ? ' to ' + r.max : ' or more'}`);
      }
    }
    rec.lots = n;
  }
  if (remarks !== undefined) rec.remarks = String(remarks);
  rec.updatedAt = new Date().toISOString();
  db.save();
  res.json({ application: rec, calc: rec.category ? computeApplication(ipo, rec) : null });
});

// ---------- Reports ----------
function reportFilters(q) {
  const ipoIds = []
    .concat(q.ipo || [])
    .flatMap((v) => String(v).split(','))
    .filter(Boolean);
  return {
    from: q.from || '',
    to: q.to || '',
    category: CATEGORIES.includes(q.category) ? q.category : '',
    ipoIds,
  };
}

app.get('/api/report', (req, res) => res.json(buildReport(db.load(), reportFilters(req.query))));

app.get('/api/report.xlsx', async (req, res) => {
  const buf = await toExcel(buildReport(db.load(), reportFilters(req.query)));
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="IPO-Report-${istDate()}.xlsx"`);
  res.send(Buffer.from(buf));
});

app.get('/api/report.pdf', async (req, res) => {
  const buf = await toPdf(buildReport(db.load(), reportFilters(req.query)));
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="IPO-Report-${istDate()}.pdf"`);
  res.send(buf);
});

// ---------- Auto-sync scheduler ----------
async function runSync() {
  try {
    const r = await nse.sync();
    console.log(`[sync] ${r.found} IPOs from NSE (${r.added} new, ${r.updated} updated)`);
  } catch (e) {
    console.warn('[sync] failed:', e.message);
  }
}

if (require.main === module) {
  db.load();
  app.listen(PORT, () => console.log(`IPO tracker running on http://localhost:${PORT}`));
  if (process.env.DISABLE_SYNC !== '1') {
    runSync();
    setInterval(runSync, SYNC_HOURS * 3600 * 1000);
  }
}

module.exports = app;
