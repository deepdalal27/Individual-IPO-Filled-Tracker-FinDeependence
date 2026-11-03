(() => {
  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? '–' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
  const rs = (n) => (n == null ? '–' : '₹' + inr(n));
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fd = (d) => { if (!d) return '–'; const [y, m, x] = String(d).split('-'); return `${x} ${MON[m - 1]} ${y}`; };
  const fdx = (d) => { if (!d) return ''; const [y, m, x] = String(d).split('-'); return `${x}-${MON[m - 1]}-${y}`; };
  const CAT = { SHNI: 'sHNI', BHNI: 'bHNI' };
  const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 2400);
  }

  // ---------- SEBI category maths (amount at upper price band) ----------
  // Retail ≤ ₹2,00,000 · sHNI > ₹2,00,000 and ≤ ₹10,00,000 · bHNI > ₹10,00,000
  const lotAmt = (ipo) => (Number(ipo.lotSize) || 0) * (Number(ipo.priceHigh) || 0);
  function range(ipo, cat) {
    const a = lotAmt(ipo); if (!a) return null;
    if (cat === 'SHNI') { const min = Math.floor(200000 / a) + 1, max = Math.floor(1000000 / a); return max >= min ? { min, max } : null; }
    if (cat === 'BHNI') return { min: Math.floor(1000000 / a) + 1, max: null };
    return null;
  }
  function calc(ipo, app) {
    const r = range(ipo, app.category);
    if (!r) return { lots: null, shares: null, amount: null };
    const o = Number(app.lots);
    const lots = Number.isInteger(o) && o >= r.min && (r.max == null || o <= r.max) ? o : r.min;
    const shares = lots * Number(ipo.lotSize);
    return { lots, shares, amount: shares * Number(ipo.priceHigh) };
  }
  function status(ipo) {
    const t = istToday();
    if (ipo.openDate && t < ipo.openDate) return 'Upcoming';
    if (ipo.closeDate && t > ipo.closeDate) return 'Closed';
    return ipo.openDate ? 'Open' : 'Upcoming';
  }

  // ---------- state ----------
  const S = { accounts: [], ipos: [], apps: new Map(), loaded: { accounts: false, ipos: false, apps: false } };
  let db = null, downloads = null;
  let view = store.get('view') || 'apply';
  let sel = store.get('selIpo') || null;
  const appKey = (ipoId, accId) => `${ipoId}__${accId}`;
  const sortedAccounts = () => S.accounts.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(b.name));
  const sortedIpos = () => S.ipos.slice().sort((a, b) => String(b.openDate || '9999').localeCompare(String(a.openDate || '9999')));
  const appliedCount = (ipoId) => { let n = 0; for (const a of S.apps.values()) if (a.ipoId === ipoId && a.category) n++; return n; };

  function showStatus(msg) { const s = $('#status'); s.textContent = msg || ''; s.hidden = !msg; }

  // ---------- tabs ----------
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; store.set('view', view); render(); }));
  function render() {
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    $$('section.view').forEach((s) => (s.hidden = s.id !== 'v-' + view));
    if (view === 'apply') renderApply();
    if (view === 'report') renderReport();
    if (view === 'ipos') renderIpos();
    if (view === 'accounts') renderAccounts();
  }
  // Re-render on live data, but not while the person is typing in a field.
  let pending = false;
  function schedule() {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT') && a.closest('main')) { pending = true; return; }
    render();
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (pending) { pending = false; schedule(); } }, 0));

  // ---------- Apply ----------
  $('#ipoFilter').addEventListener('change', renderApply);
  function renderApply() {
    const list = sortedIpos().filter((i) => $('#ipoFilter').value === 'all' || status(i) !== 'Closed' || (i.closeDate || '') >= addDays(istToday(), -7));
    if (sel && !S.ipos.some((i) => i.id === sel)) sel = null;
    if (!sel) sel = (list.find((i) => status(i) === 'Open') || list.find((i) => status(i) === 'Upcoming') || list[0] || {}).id || null;
    $('#ipoList').innerHTML = !S.loaded.ipos ? '<p class="muted">Loading IPOs…</p>' : list.length ? list.map((i) => {
      const st = status(i), n = appliedCount(i.id);
      return `<button class="ipo-btn ${i.id === sel ? 'sel' : ''}" data-id="${esc(i.id)}">
        <span class="nm">${esc(i.name)} <span class="pill ${st}">${st}</span></span>
        <span class="sub">${fd(i.openDate)} – ${fd(i.closeDate)}</span>
        <span class="sub">${i.priceHigh ? '₹' + inr(i.priceHigh) : 'Price TBA'} · Lot ${inr(i.lotSize)} · ${n ? n + ' applied' : 'none applied'}</span>
      </button>`; }).join('') : '<p class="muted">No open or upcoming IPOs. Choose "All" to see older ones, or add an IPO in the IPOs tab.</p>';
    $$('#ipoList .ipo-btn').forEach((b) => b.addEventListener('click', () => { sel = b.dataset.id; store.set('selIpo', sel); renderApply(); }));
    renderPanel();
  }

  function renderPanel() {
    const p = $('#applyPanel');
    const ipo = S.ipos.find((i) => i.id === sel);
    if (!S.loaded.ipos || !S.loaded.accounts) { p.innerHTML = '<p class="muted">Loading…</p>'; return; }
    if (!ipo) { p.innerHTML = '<div class="empty"><b>Pick an IPO on the left</b><span>Then click sHNI or bHNI for each account that applied.</span></div>'; return; }
    if (!S.accounts.length) { p.innerHTML = '<div class="empty"><b>No accounts yet</b><span>Add your accounts in the Accounts tab.</span></div>'; return; }
    const st = status(ipo), rS = range(ipo, 'SHNI'), rB = range(ipo, 'BHNI'), la = lotAmt(ipo);
    const rows = sortedAccounts().filter((a) => a.active !== false || S.apps.get(appKey(ipo.id, a.id))?.category);
    p.innerHTML = `
      <div class="panel-head">
        <div><h2>${esc(ipo.name)} <span class="pill ${st}">${st}</span></h2>
          <p class="muted">${esc(ipo.symbol || '')}${ipo.symbol ? ' · ' : ''}${esc(ipo.type || 'Mainboard')} · ${fd(ipo.openDate)} to ${fd(ipo.closeDate)}</p></div>
        <button id="clearAll" class="danger">Clear all categories</button>
      </div>
      <div class="facts">
        <div class="fact"><small>Price band</small><b>${ipo.priceHigh ? `₹${inr(ipo.priceLow || ipo.priceHigh)} – ₹${inr(ipo.priceHigh)}` : 'TBA'}</b></div>
        <div class="fact"><small>Lot size</small><b>${ipo.lotSize ? inr(ipo.lotSize) + ' sh' : 'TBA'}</b></div>
        <div class="fact"><small>1 lot @ upper</small><b>${la ? rs(la) : '–'}</b></div>
        <div class="fact shni"><small>sHNI minimum</small><b>${rS ? `${rS.min} lots · ${rs(rS.min * la)}` : '–'}</b>${rS ? `<span class="hint">up to ${rS.max} lots</span>` : ''}</div>
        <div class="fact bhni"><small>bHNI minimum</small><b>${rB ? `${rB.min} lots · ${rs(rB.min * la)}` : '–'}</b></div>
      </div>
      ${la ? '' : '<p class="notice">Price band or lot size not announced yet. You can still mark categories; lots and amounts fill in once the IPO details are added.</p>'}
      <div class="tbl"><table>
        <thead><tr><th>#</th><th>Account</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount blocked</th><th>Remarks</th></tr></thead>
        <tbody>${rows.map((a, i) => rowHtml(ipo, a, i)).join('')}</tbody>
        <tfoot>${totalsHtml(ipo, rows)}</tfoot>
      </table></div>`;
    $$('.seg button', p).forEach((b) => b.addEventListener('click', () => saveApp(ipo, b.closest('tr').dataset.acc, { category: b.dataset.cat || null })));
    $$('input.lots', p).forEach((inp) => inp.addEventListener('change', () => saveApp(ipo, inp.closest('tr').dataset.acc, { lots: inp.value })));
    $$('input.rem', p).forEach((inp) => inp.addEventListener('change', () => saveApp(ipo, inp.closest('tr').dataset.acc, { remarks: inp.value })));
    const ca = $('#clearAll');
    ca.addEventListener('click', async () => {
      if (!ca.dataset.armed) { ca.dataset.armed = '1'; ca.textContent = 'Click again to clear'; setTimeout(() => { if (ca.isConnected) { delete ca.dataset.armed; ca.textContent = 'Clear all categories'; } }, 4000); return; }
      ca.disabled = true;
      for (const a of rows) { const k = appKey(ipo.id, a.id); if (S.apps.get(k)?.category) await db.collection('apps').doc(k).delete().catch(() => {}); }
      toast('Cleared all categories for this IPO');
    });
  }
  function rowHtml(ipo, acc, i) {
    const app = S.apps.get(appKey(ipo.id, acc.id));
    const cat = app?.category || '';
    const c = cat ? calc(ipo, app) : null;
    const r = cat ? range(ipo, cat) : null;
    return `<tr data-acc="${esc(acc.id)}" class="${cat ? 'c-' + cat : ''}">
      <td class="num">${i + 1}</td>
      <td>${esc(acc.name)}${acc.pan ? `<div class="muted" style="font-size:11px;font-family:var(--mono)">${esc(acc.pan)}</div>` : ''}</td>
      <td><div class="seg" role="group" aria-label="Category for ${esc(acc.name)}">
        <button data-cat="" class="${!cat ? 'on' : ''}">None</button><button data-cat="SHNI" class="${cat === 'SHNI' ? 'on' : ''}">sHNI</button><button data-cat="BHNI" class="${cat === 'BHNI' ? 'on' : ''}">bHNI</button>
      </div></td>
      <td class="num">${cat ? `<input class="lots" type="number" step="1" min="${r?.min ?? 1}" ${r?.max ? `max="${r.max}"` : ''} value="${c?.lots ?? ''}" ${r ? '' : 'disabled'} aria-label="Lots" title="Defaults to the category minimum">` : '–'}</td>
      <td class="num">${cat ? inr(c?.shares) : '–'}</td>
      <td class="num">${cat ? rs(c?.amount) : '–'}</td>
      <td>${cat ? `<input class="rem" value="${esc(app?.remarks || '')}" placeholder="Optional" aria-label="Remarks">` : ''}</td>
    </tr>`;
  }
  function totalsHtml(ipo, rows) {
    const t = { s: 0, b: 0, lots: 0, shares: 0, amt: 0 };
    for (const a of rows) { const app = S.apps.get(appKey(ipo.id, a.id)); if (!app?.category) continue; app.category === 'SHNI' ? t.s++ : t.b++; const c = calc(ipo, app); t.lots += c.lots || 0; t.shares += c.shares || 0; t.amt += c.amount || 0; }
    return `<tr class="tot"><td></td><td>Total · ${t.s + t.b} accounts</td><td>${t.s} sHNI · ${t.b} bHNI</td><td class="num">${inr(t.lots)}</td><td class="num">${inr(t.shares)}</td><td class="num">${rs(t.amt)}</td><td></td></tr>`;
  }
  async function saveApp(ipo, accId, patch) {
    if (!db) return toast('Saving is unavailable right now', true);
    const k = appKey(ipo.id, accId);
    const cur = S.apps.get(k) || { ipoId: ipo.id, accountId: accId, category: null, lots: null, remarks: '' };
    const next = { ipoId: ipo.id, accountId: accId, category: cur.category || null, lots: cur.lots ?? null, remarks: cur.remarks || '' };
    if ('category' in patch) { if (patch.category !== next.category) next.lots = null; next.category = patch.category; }
    if ('lots' in patch) {
      const n = patch.lots === '' ? null : Number(patch.lots);
      const r = range(ipo, next.category);
      if (n != null && r && (!Number.isInteger(n) || n < r.min || (r.max != null && n > r.max))) {
        toast(`${CAT[next.category]} lots must be ${r.min}${r.max != null ? ' to ' + r.max : ' or more'}`, true); renderPanel(); return;
      }
      next.lots = n;
    }
    if ('remarks' in patch) next.remarks = String(patch.remarks).slice(0, 200);
    next.updatedAt = new Date().toISOString();
    try {
      if (!next.category) await db.collection('apps').doc(k).delete();
      else await db.collection('apps').doc(k).set(next);
      toast('Saved');
    } catch (e) { toast(e?.code === 'quota_exceeded' ? 'Storage is full. Delete old IPOs to free space.' : 'Could not save. Check your connection and try again.', true); }
  }

  // ---------- Reports ----------
  // Every IPO × account pair in scope becomes one "cell": sHNI, bHNI or None.
  // All views (by IPO, by account, matrix, all rows) and the Excel/PDF exports are built from these cells.
  const CATN = { SHNI: 'sHNI', BHNI: 'bHNI', NONE: 'None' };
  const filters = () => ({ from: $('#rFrom').value, to: $('#rTo').value, ipo: $('#rIpo').value, acc: $('#rAcc').value, cat: $('#rCat').value, empty: $('#rEmpty').checked });
  function buildData(f) {
    let ipos = sortedIpos();
    if (f.ipo) ipos = ipos.filter((i) => i.id === f.ipo);
    if (f.from) ipos = ipos.filter((i) => (i.closeDate || i.openDate || '9999') >= f.from);
    if (f.to) ipos = ipos.filter((i) => (i.openDate || '0000') <= f.to);
    const applied = (ipoId, accId) => { const a = S.apps.get(appKey(ipoId, accId)); return a && a.category ? a : null; };
    if (!f.empty && !f.ipo) ipos = ipos.filter((i) => sortedAccounts().some((a) => applied(i.id, a.id)));
    let accounts = sortedAccounts().filter((a) => a.active !== false || ipos.some((i) => applied(i.id, a.id)));
    if (f.acc) accounts = accounts.filter((a) => a.id === f.acc);
    const cells = [];
    for (const ipo of ipos) for (const acc of accounts) {
      const app = applied(ipo.id, acc.id);
      const cat = app ? app.category : 'NONE';
      const c = app ? calc(ipo, app) : { lots: 0, shares: 0, amount: 0 };
      cells.push({ ipo, acc, cat, lots: c.lots, shares: c.shares, amount: c.amount, remarks: app?.remarks || '' });
    }
    const shown = f.cat ? cells.filter((c) => c.cat === f.cat) : cells;
    const sum = (list) => {
      const t = { cells: list.length, shni: 0, bhni: 0, none: 0, lots: 0, shares: 0, amount: 0 };
      for (const c of list) { if (c.cat === 'SHNI') t.shni++; else if (c.cat === 'BHNI') t.bhni++; else t.none++; t.lots += c.lots || 0; t.shares += c.shares || 0; t.amount += c.amount || 0; }
      t.applied = t.shni + t.bhni; return t;
    };
    const byIpo = ipos.map((ipo) => { const list = shown.filter((c) => c.ipo === ipo); return { ipo: { ...ipo, status: status(ipo), lotAmount: lotAmt(ipo) }, list, t: sum(list) }; });
    const byAcc = accounts.map((acc) => { const list = shown.filter((c) => c.acc === acc); const ap = list.filter((c) => c.cat !== 'NONE'); return { acc, list, t: sum(list), last: ap[0]?.ipo || null }; });
    return { f, ipos, accounts, cells, shown, byIpo, byAcc, g: sum(shown) };
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const pill = (cat) => `<span class="pill ${cat}">${CATN[cat] || cat}</span>`;
  let rView = store.get('rView') || 'ipo';
  $$('#rViews button').forEach((b) => b.addEventListener('click', () => { rView = b.dataset.rv; store.set('rView', rView); renderReport(); }));
  ['rFrom', 'rTo', 'rIpo', 'rAcc', 'rCat', 'rEmpty'].forEach((id) => $('#' + id).addEventListener('change', renderReport));
  $$('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const t = istToday();
    if (b.dataset.range === 'month') { $('#rFrom').value = t.slice(0, 8) + '01'; $('#rTo').value = t; }
    if (b.dataset.range === 'fy') { const y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 4 ? 1 : 0); $('#rFrom').value = `${y}-04-01`; $('#rTo').value = t; }
    if (b.dataset.range === 'last30') { $('#rFrom').value = addDays(t, -30); $('#rTo').value = t; }
    if (b.dataset.range === 'clear') { ['rFrom', 'rTo', 'rIpo', 'rAcc', 'rCat'].forEach((id) => ($('#' + id).value = '')); }
    renderReport();
  }));
  // Clicking an IPO or account name in a report drills into it.
  $('#reportOut').addEventListener('click', (e) => {
    const a = e.target.closest('[data-go-ipo],[data-go-acc]'); if (!a) return;
    e.preventDefault();
    if (a.dataset.goIpo) { $('#rIpo').value = a.dataset.goIpo; rView = 'ipo'; }
    if (a.dataset.goAcc) { $('#rAcc').value = a.dataset.goAcc; rView = 'acc'; }
    store.set('rView', rView); renderReport();
  });
  const ipoLink = (i) => `<a href="#" class="go" data-go-ipo="${esc(i.id)}">${esc(i.name)}</a>`;
  const accLink = (a) => `<a href="#" class="go" data-go-acc="${esc(a.id)}">${esc(a.name)}</a>`;

  function renderReport() {
    const keep = (id, opts) => { const cur = $('#' + id).value; $('#' + id).innerHTML = opts; $('#' + id).value = [...$('#' + id).options].some((o) => o.value === cur) ? cur : ''; };
    keep('rIpo', '<option value="">All IPOs</option>' + sortedIpos().map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join(''));
    keep('rAcc', '<option value="">All accounts</option>' + sortedAccounts().map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join(''));
    $$('#rViews button').forEach((b) => b.classList.toggle('on', b.dataset.rv === rView));
    const d = buildData(filters()), g = d.g;
    const tiles = `<div class="tiles">
      <div class="fact"><small>IPOs</small><b>${d.ipos.length}</b></div>
      <div class="fact"><small>Accounts</small><b>${d.accounts.length}</b></div>
      <div class="fact shni"><small>sHNI applications</small><b>${g.shni}</b></div>
      <div class="fact bhni"><small>bHNI applications</small><b>${g.bhni}</b></div>
      <div class="fact"><small>None (not applied)</small><b>${g.none}</b><span class="hint">${pct(g.applied, g.cells)} of slots applied</span></div>
      <div class="fact"><small>Amount blocked</small><b>${rs(g.amount)}</b><span class="hint">${inr(g.lots)} lots · ${inr(g.shares)} shares</span></div>
    </div>`;
    if (!d.ipos.length) { $('#reportOut').innerHTML = tiles + `<p class="muted">${S.loaded.ipos ? 'No IPOs match these filters. Tick "Include IPOs not applied" or widen the dates.' : 'Loading…'}</p>`; return; }
    let body = '';
    if (rView === 'ipo') {
      body = `<h3 class="sec">IPO-wise · how many accounts applied</h3><div class="tbl"><table>
        <thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Status</th><th class="num">Upper price</th><th class="num">Lot</th><th class="num">Applied</th><th class="num">sHNI</th><th class="num">bHNI</th><th class="num">None</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount blocked</th></tr></thead>
        <tbody>${d.byIpo.map((b) => `<tr><td>${ipoLink(b.ipo)}</td><td>${fd(b.ipo.openDate)}</td><td>${fd(b.ipo.closeDate)}</td><td>${pill(b.ipo.status)}</td><td class="num">${rs(b.ipo.priceHigh)}</td><td class="num">${inr(b.ipo.lotSize)}</td><td class="num">${b.t.applied} / ${b.t.cells}</td><td class="num">${b.t.shni}</td><td class="num">${b.t.bhni}</td><td class="num">${b.t.none}</td><td class="num">${inr(b.t.lots)}</td><td class="num">${inr(b.t.shares)}</td><td class="num">${rs(b.t.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td class="num">${g.applied} / ${g.cells}</td><td class="num">${g.shni}</td><td class="num">${g.bhni}</td><td class="num">${g.none}</td><td class="num">${inr(g.lots)}</td><td class="num">${inr(g.shares)}</td><td class="num">${rs(g.amount)}</td></tr></tfoot></table></div>
        <h3 class="sec">Accounts in each IPO</h3>
        ${d.byIpo.map((b) => `<details class="blk" ${d.f.ipo ? 'open' : ''}><summary><span>${esc(b.ipo.name)}</span><span class="muted">${b.t.shni} sHNI · ${b.t.bhni} bHNI · ${b.t.none} None · <span class="num">${rs(b.t.amount)}</span></span></summary>
          <div class="tbl"><table><thead><tr><th>Account</th><th>PAN</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
          <tbody>${b.list.map((c) => `<tr class="${c.cat === 'NONE' ? 'none-row' : 'c-' + c.cat}"><td>${accLink(c.acc)}</td><td class="mono">${esc(c.acc.pan || '')}</td><td>${pill(c.cat)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.lots)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.shares)}</td><td class="num">${c.cat === 'NONE' ? '–' : rs(c.amount)}</td><td>${esc(c.remarks)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
    } else if (rView === 'acc') {
      body = `<h3 class="sec">Account-wise · which IPOs each account applied in</h3><div class="tbl"><table>
        <thead><tr><th>#</th><th>Account</th><th>PAN</th><th class="num">IPOs applied</th><th class="num">sHNI</th><th class="num">bHNI</th><th class="num">None</th><th class="num">Hit rate</th><th class="num">Amount blocked</th><th>Last applied in</th></tr></thead>
        <tbody>${d.byAcc.map((b, i) => `<tr><td class="num">${i + 1}</td><td>${accLink(b.acc)}</td><td class="mono">${esc(b.acc.pan || '')}</td><td class="num">${b.t.applied} / ${b.t.cells}</td><td class="num">${b.t.shni}</td><td class="num">${b.t.bhni}</td><td class="num">${b.t.none}</td><td class="num">${pct(b.t.applied, b.t.cells)}</td><td class="num">${rs(b.t.amount)}</td><td>${b.last ? esc(b.last.name) : '–'}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td></td><td>Total</td><td></td><td class="num">${g.applied} / ${g.cells}</td><td class="num">${g.shni}</td><td class="num">${g.bhni}</td><td class="num">${g.none}</td><td class="num">${pct(g.applied, g.cells)}</td><td class="num">${rs(g.amount)}</td><td></td></tr></tfoot></table></div>
        <h3 class="sec">IPO history of each account</h3>
        ${d.byAcc.map((b) => `<details class="blk" ${d.f.acc ? 'open' : ''}><summary><span>${esc(b.acc.name)}</span><span class="muted">${b.t.applied} IPOs · ${b.t.shni} sHNI · ${b.t.bhni} bHNI · <span class="num">${rs(b.t.amount)}</span></span></summary>
          <div class="tbl"><table><thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Upper price</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
          <tbody>${b.list.map((c) => `<tr class="${c.cat === 'NONE' ? 'none-row' : 'c-' + c.cat}"><td>${ipoLink(c.ipo)}</td><td>${fd(c.ipo.openDate)}</td><td>${fd(c.ipo.closeDate)}</td><td>${pill(c.cat)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.lots)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.shares)}</td><td class="num">${rs(c.ipo.priceHigh)}</td><td class="num">${c.cat === 'NONE' ? '–' : rs(c.amount)}</td><td>${esc(c.remarks)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
    } else if (rView === 'matrix') {
      const cellOf = (ipo, acc) => d.shown.find((c) => c.ipo === ipo && c.acc === acc);
      const mark = (c) => (!c ? '' : c.cat === 'SHNI' ? '<span class="mx s">S</span>' : c.cat === 'BHNI' ? '<span class="mx b">B</span>' : '<span class="mx n">–</span>');
      body = `<h3 class="sec">Matrix · S = sHNI, B = bHNI, – = None</h3><div class="tbl matrix"><table>
        <thead><tr><th class="stick">Account</th>${d.ipos.map((i) => `<th class="rot" title="${esc(i.name)}"><a href="#" class="go" data-go-ipo="${esc(i.id)}">${esc(i.symbol || i.name.split(' ')[0])}</a><div class="muted">${fd(i.openDate).slice(0, 6)}</div></th>`).join('')}<th class="num">S</th><th class="num">B</th><th class="num">–</th></tr></thead>
        <tbody>${d.byAcc.map((b) => `<tr><td class="stick">${accLink(b.acc)}</td>${d.ipos.map((i) => `<td class="mxc">${mark(cellOf(i, b.acc))}</td>`).join('')}<td class="num">${b.t.shni}</td><td class="num">${b.t.bhni}</td><td class="num">${b.t.none}</td></tr>`).join('')}</tbody>
        <tfoot>${[['sHNI', 'shni'], ['bHNI', 'bhni'], ['None', 'none']].map(([l, k]) => `<tr class="tot"><td class="stick">${l}</td>${d.byIpo.map((b) => `<td class="num">${b.t[k]}</td>`).join('')}<td class="num">${k === 'shni' ? g.shni : ''}</td><td class="num">${k === 'bhni' ? g.bhni : ''}</td><td class="num">${k === 'none' ? g.none : ''}</td></tr>`).join('')}</tfoot></table></div>`;
    } else {
      body = `<h3 class="sec">All rows · every IPO × account (${d.shown.length})</h3><div class="tbl"><table>
        <thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Account</th><th>PAN</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Upper price</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
        <tbody>${d.shown.map((c) => `<tr class="${c.cat === 'NONE' ? 'none-row' : 'c-' + c.cat}"><td>${ipoLink(c.ipo)}</td><td>${fd(c.ipo.openDate)}</td><td>${fd(c.ipo.closeDate)}</td><td>${accLink(c.acc)}</td><td class="mono">${esc(c.acc.pan || '')}</td><td>${pill(c.cat)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.lots)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.shares)}</td><td class="num">${rs(c.ipo.priceHigh)}</td><td class="num">${c.cat === 'NONE' ? '–' : rs(c.amount)}</td><td>${esc(c.remarks)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    $('#reportOut').innerHTML = tiles + body;
  }

  function save(filename, data) {
    const type = filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.json') ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileStamp = () => istToday();
  const scopeText = (f) => [f.from && 'From ' + fdx(f.from), f.to && 'To ' + fdx(f.to), f.ipo && 'IPO: ' + (S.ipos.find((i) => i.id === f.ipo)?.name || ''), f.acc && 'Account: ' + (S.accounts.find((a) => a.id === f.acc)?.name || ''), f.cat && 'Category: ' + CATN[f.cat]].filter(Boolean).join('   ');

  $('#dlXlsx').addEventListener('click', () => {
    if (!window.XLSX) return toast('Excel library did not load. Reload the page.', true);
    const d = buildData(filters()), g = d.g;
    const wb = XLSX.utils.book_new();
    const add = (name, rows, widths, moneyCols = [], filter = true) => {
      const sh = XLSX.utils.aoa_to_sheet(rows);
      sh['!cols'] = widths.map((w) => ({ wch: w }));
      const rg = XLSX.utils.decode_range(sh['!ref']);
      for (let R = 1; R <= rg.e.r; R++) for (const C of moneyCols) { const c = sh[XLSX.utils.encode_cell({ r: R, c: C })]; if (c && typeof c.v === 'number') c.z = '#,##,##0'; }
      if (filter && rows.length > 1) sh['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, sh, name);
    };
    add('Overview', [
      ['FinDeependence · HNI IPO Ledger', ''], ['Generated (IST)', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })], ['Filters', scopeText(d.f) || 'None'],
      ['IPOs', d.ipos.length], ['Accounts', d.accounts.length], ['sHNI applications', g.shni], ['bHNI applications', g.bhni], ['None (not applied)', g.none],
      ['Total lots', g.lots], ['Total shares', g.shares], ['Amount blocked (Rs, upper band)', g.amount],
    ], [34, 50], [1], false);
    add('IPO-wise', [['IPO', 'Symbol', 'Type', 'Open', 'Close', 'Status', 'Price low', 'Upper price', 'Lot size', '1 lot (Rs)', 'Accounts', 'Applied', 'sHNI', 'bHNI', 'None', 'Total lots', 'Total shares', 'Amount blocked (Rs)'],
      ...d.byIpo.map((b) => [b.ipo.name, b.ipo.symbol || '', b.ipo.type || 'Mainboard', fdx(b.ipo.openDate), fdx(b.ipo.closeDate), b.ipo.status, b.ipo.priceLow ?? '', b.ipo.priceHigh ?? '', b.ipo.lotSize ?? '', b.ipo.lotAmount || '', b.t.cells, b.t.applied, b.t.shni, b.t.bhni, b.t.none, b.t.lots, b.t.shares, b.t.amount]),
      ['TOTAL', '', '', '', '', '', '', '', '', '', g.cells, g.applied, g.shni, g.bhni, g.none, g.lots, g.shares, g.amount]],
      [40, 12, 11, 12, 12, 10, 10, 11, 9, 11, 9, 9, 7, 7, 7, 10, 12, 18], [9, 17]);
    add('Account-wise', [['#', 'Account', 'PAN', 'IPOs in scope', 'IPOs applied', 'sHNI', 'bHNI', 'None', 'Hit rate %', 'Amount blocked (Rs)', 'Last applied in'],
      ...d.byAcc.map((b, i) => [i + 1, b.acc.name, b.acc.pan || '', b.t.cells, b.t.applied, b.t.shni, b.t.bhni, b.t.none, b.t.cells ? Math.round((b.t.applied / b.t.cells) * 100) : 0, b.t.amount, b.last?.name || '']),
      ['', 'TOTAL', '', g.cells, g.applied, g.shni, g.bhni, g.none, g.cells ? Math.round((g.applied / g.cells) * 100) : 0, g.amount, '']],
      [5, 30, 13, 12, 12, 7, 7, 7, 10, 18, 36], [9]);
    const cellOf = (ipo, acc) => d.shown.find((c) => c.ipo === ipo && c.acc === acc);
    add('Matrix', [['Account', ...d.ipos.map((i) => `${i.name} (${fdx(i.openDate)})`), 'sHNI', 'bHNI', 'None'],
      ...d.byAcc.map((b) => [b.acc.name, ...d.ipos.map((i) => { const c = cellOf(i, b.acc); return !c ? '' : CATN[c.cat]; }), b.t.shni, b.t.bhni, b.t.none]),
      ['sHNI', ...d.byIpo.map((b) => b.t.shni), g.shni, '', ''], ['bHNI', ...d.byIpo.map((b) => b.t.bhni), '', g.bhni, ''], ['None', ...d.byIpo.map((b) => b.t.none), '', '', g.none]],
      [30, ...d.ipos.map(() => 16), 7, 7, 7], [], false);
    add('All rows', [['IPO', 'Symbol', 'Open', 'Close', 'Status', 'Account', 'PAN', 'Category', 'Applied', 'Lots', 'Shares', 'Upper price', 'Amount blocked (Rs)', 'Remarks'],
      ...d.shown.map((c) => [c.ipo.name, c.ipo.symbol || '', fdx(c.ipo.openDate), fdx(c.ipo.closeDate), status(c.ipo), c.acc.name, c.acc.pan || '', CATN[c.cat], c.cat === 'NONE' ? 'No' : 'Yes', c.lots || 0, c.shares || 0, c.ipo.priceHigh ?? '', c.amount || 0, c.remarks])],
      [36, 12, 12, 12, 10, 28, 13, 9, 8, 7, 9, 11, 18, 24], [12]);
    save(`IPO-Report-${fileStamp()}.xlsx`, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  });

  $('#dlPdf').addEventListener('click', () => {
    const J = window.jspdf?.jsPDF;
    if (!J) return toast('PDF library did not load. Reload the page.', true);
    const d = buildData(filters()), g = d.g;
    const n = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
    const doc = new J({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const head = { fillColor: [14, 39, 64], textColor: 255, fontStyle: 'bold' };
    const foot = { fillColor: [234, 227, 210], textColor: 20, fontStyle: 'bold' };
    const table = (opts, rightFrom) => doc.autoTable({ margin: { left: 32, right: 32, top: 40 }, headStyles: head, footStyles: foot, styles: { fontSize: 8, cellPadding: 3.5 }, showFoot: 'lastPage',
      didParseCell: (x) => { if (rightFrom != null && x.column.index >= rightFrom && x.column.index < (opts.rightTo ?? 99)) x.cell.styles.halign = 'right'; }, ...opts });
    const heading = (text, sub) => {
      let y = (doc.lastAutoTable?.finalY || 70) + 26;
      if (y > H - 100) { doc.addPage(); y = 50; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(14, 39, 64); doc.text(text, 32, y);
      if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90); doc.text(sub, 32, y + 12); }
      return y + (sub ? 18 : 8);
    };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(14, 39, 64); doc.text('IPO Application Report - sHNI / bHNI', 32, 50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    const sc = scopeText(d.f);
    doc.text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST${sc ? '   |   ' + sc : ''}   |   Amounts in Rs at upper price band`, 32, 64);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(20);
    doc.text(`IPOs ${d.ipos.length}   Accounts ${d.accounts.length}   sHNI ${g.shni}   bHNI ${g.bhni}   None ${g.none}   Lots ${n(g.lots)}   Shares ${n(g.shares)}   Blocked Rs ${n(g.amount)}`, 32, 82);
    doc.lastAutoTable = { finalY: 84 };
    let y = heading('IPO-wise summary');
    table({ startY: y, head: [['IPO', 'Open', 'Close', 'Status', 'Upper price', 'Lot', 'Applied', 'sHNI', 'bHNI', 'None', 'Lots', 'Shares', 'Amount blocked']],
      body: d.byIpo.map((b) => [b.ipo.name, fdx(b.ipo.openDate), fdx(b.ipo.closeDate), b.ipo.status, n(b.ipo.priceHigh), n(b.ipo.lotSize), `${b.t.applied}/${b.t.cells}`, b.t.shni, b.t.bhni, b.t.none, n(b.t.lots), n(b.t.shares), n(b.t.amount)]),
      foot: [['TOTAL', '', '', '', '', '', `${g.applied}/${g.cells}`, g.shni, g.bhni, g.none, n(g.lots), n(g.shares), n(g.amount)]] }, 4);
    y = heading('Account-wise summary');
    table({ startY: y, head: [['#', 'Account', 'PAN', 'IPOs applied', 'sHNI', 'bHNI', 'None', 'Hit rate', 'Amount blocked', 'Last applied in']],
      body: d.byAcc.map((b, i) => [i + 1, b.acc.name, b.acc.pan || '', `${b.t.applied}/${b.t.cells}`, b.t.shni, b.t.bhni, b.t.none, pct(b.t.applied, b.t.cells), n(b.t.amount), b.last?.name || '-']),
      foot: [['', 'TOTAL', '', `${g.applied}/${g.cells}`, g.shni, g.bhni, g.none, pct(g.applied, g.cells), n(g.amount), '']],
      rightTo: 9 }, 3);
    // Matrix in chunks of 10 IPOs so it fits the page width.
    const cellOf = (ipo, acc) => d.shown.find((c) => c.ipo === ipo && c.acc === acc);
    for (let k = 0; k < d.ipos.length; k += 10) {
      const part = d.ipos.slice(k, k + 10);
      y = heading(`Matrix${d.ipos.length > 10 ? ` (IPOs ${k + 1}-${k + part.length})` : ''}`, 'S = sHNI   B = bHNI   - = None');
      table({ startY: y, head: [['Account', ...part.map((i) => (i.symbol || i.name).slice(0, 12))]],
        body: d.byAcc.map((b) => [b.acc.name, ...part.map((i) => { const c = cellOf(i, b.acc); return !c ? '' : c.cat === 'SHNI' ? 'S' : c.cat === 'BHNI' ? 'B' : '-'; })]),
        foot: [['sHNI / bHNI / None', ...part.map((i) => { const b = d.byIpo.find((x) => x.ipo.id === i.id); return `${b.t.shni}/${b.t.bhni}/${b.t.none}`; })]],
        didParseCell: (x) => { if (x.column.index > 0) x.cell.styles.halign = 'center'; if (x.section === 'body' && x.cell.raw === 'S') x.cell.styles.textColor = [44, 143, 147]; if (x.section === 'body' && x.cell.raw === 'B') x.cell.styles.textColor = [29, 95, 168]; } });
    }
    for (const b of d.byIpo) {
      const ap = b.list.filter((c) => c.cat !== 'NONE'), no = b.list.filter((c) => c.cat === 'NONE');
      y = heading(`${b.ipo.name}${b.ipo.symbol ? ' (' + b.ipo.symbol + ')' : ''}`, `${fdx(b.ipo.openDate)} to ${fdx(b.ipo.closeDate)}  |  Price band Rs ${n(b.ipo.priceLow || b.ipo.priceHigh)} - ${n(b.ipo.priceHigh)}  |  Lot ${n(b.ipo.lotSize)}  |  sHNI ${b.t.shni}  bHNI ${b.t.bhni}  None ${b.t.none}`);
      table({ startY: y, head: [['#', 'Account', 'PAN', 'Category', 'Lots', 'Shares', 'Upper price', 'Amount blocked', 'Remarks']],
        body: ap.length ? ap.map((c, i) => [i + 1, c.acc.name, c.acc.pan || '', CATN[c.cat], n(c.lots), n(c.shares), n(c.ipo.priceHigh), n(c.amount), c.remarks]) : [['', 'No applications', '', '', '', '', '', '', '']],
        foot: [['', `Applied ${b.t.applied} accounts`, '', `${b.t.shni} S / ${b.t.bhni} B`, n(b.t.lots), n(b.t.shares), '', n(b.t.amount), '']],
        didParseCell: (x) => { if ([0, 4, 5, 6, 7].includes(x.column.index)) x.cell.styles.halign = 'right'; } });
      if (no.length) {
        let yy = doc.lastAutoTable.finalY + 12; if (yy > H - 50) { doc.addPage(); yy = 50; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
        const lines = doc.splitTextToSize(`None (${no.length}): ${no.map((c) => c.acc.name).join(', ')}`, W - 64);
        doc.text(lines, 32, yy); doc.lastAutoTable.finalY = yy + lines.length * 10;
      }
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(14, 39, 64); doc.rect(0, 0, W, 28, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(127, 211, 214); doc.text('FINDEEPENDENCE', 32, 18);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(255); doc.text('CA Deep Dalal  |  Chartered Accountant  |  Fund Manager', W - 32, 18, { align: 'right' });
      doc.setFontSize(8); doc.setTextColor(140); doc.text('FinDeependence · HNI IPO Ledger', 32, H - 16); doc.text(`Page ${i} of ${pages}`, W - 32, H - 16, { align: 'right' });
    }
    save(`IPO-Report-${fileStamp()}.pdf`, doc.output('arraybuffer'));
  });

  // ---------- IPOs ----------
  const form = $('#ipoForm');
  $('#addIpo').addEventListener('click', () => { form.reset(); $('#fId').value = ''; form.hidden = false; $('#fName').focus(); });
  $('#ipoCancel').addEventListener('click', () => (form.hidden = true));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!db) return toast('Saving is unavailable right now', true);
    const id = $('#fId').value || ('m-' + Date.now().toString(36));
    const old = S.ipos.find((i) => i.id === id);
    const num = (v) => (v === '' ? null : Number(v));
    const body = {
      ...(old ? Object.fromEntries(Object.entries(old).filter(([k]) => k !== 'id')) : { source: 'Manual', createdAt: new Date().toISOString() }),
      name: $('#fName').value.trim(), symbol: $('#fSymbol').value.trim().toUpperCase(), type: $('#fType').value,
      openDate: $('#fOpen').value || null, closeDate: $('#fClose').value || null,
      priceLow: num($('#fLow').value), priceHigh: num($('#fHigh').value), lotSize: num($('#fLot').value),
      edited: true, updatedAt: new Date().toISOString(),
    };
    if (!body.name) return toast('Enter the company name', true);
    try { await db.collection('ipos').doc(id).set(body); form.hidden = true; toast('IPO saved'); }
    catch { toast('Could not save the IPO. Try again.', true); }
  });
  function renderIpos() {
    const ls = S.feed?.updatedAt || S.ipos.map((i) => i.syncedAt).filter(Boolean).sort().pop();
    $('#ipoInfo').textContent = `New mainboard IPOs arrive from NSE automatically every hour, with dates, price band and lot size${ls ? ` (last NSE update ${new Date(ls).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST)` : ''}. You only need to add an IPO here if it is missing.`;
    const list = sortedIpos();
    $('#ipoTable').innerHTML = `<thead><tr><th>Company</th><th>Symbol</th><th>Type</th><th>Open</th><th>Close</th><th>Status</th><th class="num">Price band</th><th class="num">Lot</th><th class="num">sHNI min</th><th class="num">bHNI min</th><th>Source</th><th></th></tr></thead><tbody>` +
      (list.length ? list.map((i) => { const st = status(i), a = lotAmt(i), rS = range(i, 'SHNI'), rB = range(i, 'BHNI'); return `<tr>
        <td>${esc(i.name)}</td><td style="font-family:var(--mono)">${esc(i.symbol || '')}</td><td>${esc(i.type || 'Mainboard')}</td><td>${fd(i.openDate)}</td><td>${fd(i.closeDate)}</td>
        <td><span class="pill ${st}">${st}</span></td>
        <td class="num">${i.priceHigh ? `₹${inr(i.priceLow || i.priceHigh)} – ${inr(i.priceHigh)}` : 'TBA'}</td><td class="num">${inr(i.lotSize)}</td>
        <td class="num">${rS ? `${rS.min} · ${rs(rS.min * a)}` : '–'}</td><td class="num">${rB ? `${rB.min} · ${rs(rB.min * a)}` : '–'}</td>
        <td>${esc(i.source || 'Manual')}${i.edited && i.source === 'NSE' ? ' (edited)' : ''}</td>
        <td><div class="row"><button data-edit="${esc(i.id)}">Edit</button><button class="danger" data-del="${esc(i.id)}">Delete</button></div></td></tr>`; }).join('')
      : `<tr><td colspan="12" class="muted">${S.loaded.ipos ? 'No IPOs yet. Use Add IPO to enter one.' : 'Loading…'}</td></tr>`) + '</tbody>';
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const i = S.ipos.find((x) => x.id === b.dataset.edit); if (!i) return;
      $('#fId').value = i.id; $('#fName').value = i.name || ''; $('#fSymbol').value = i.symbol || ''; $('#fType').value = i.type || 'Mainboard';
      $('#fOpen').value = i.openDate || ''; $('#fClose').value = i.closeDate || ''; $('#fLow').value = i.priceLow ?? ''; $('#fHigh').value = i.priceHigh ?? ''; $('#fLot').value = i.lotSize ?? '';
      form.hidden = false; $('#fName').focus();
    }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Confirm delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000); return; }
      const id = b.dataset.del; b.disabled = true;
      try {
        for (const [k, a] of S.apps) if (a.ipoId === id) await db.collection('apps').doc(k).delete();
        await db.collection('ipos').doc(id).delete(); toast('IPO deleted');
      } catch { toast('Could not delete. Try again.', true); }
    }));
  }

  // ---------- Accounts ----------
  $('#addAcc').addEventListener('click', async () => {
    const name = $('#newAcc').value.trim();
    if (!name) { $('#newAcc').focus(); return toast('Type the account holder name first', true); }
    if (!db) return toast('Saving is unavailable right now', true);
    const order = Math.max(0, ...S.accounts.map((a) => a.order || 0)) + 1;
    try { await db.collection('accounts').doc('a-' + Date.now().toString(36)).set({ name, pan: '', notes: '', active: true, order }); $('#newAcc').value = ''; toast('Account added'); }
    catch { toast('Could not add the account. Try again.', true); }
  });
  function renderAccounts() {
    const list = sortedAccounts();
    $('#accTable').innerHTML = `<thead><tr><th>#</th><th>Name</th><th>PAN</th><th>Notes (bank / UPI / broker)</th><th>Active</th><th></th></tr></thead><tbody>` +
      (list.length ? list.map((a, i) => `<tr data-id="${esc(a.id)}" class="${a.active === false ? 'inactive' : ''}">
        <td class="num">${i + 1}</td>
        <td><input class="cell" data-f="name" value="${esc(a.name)}" aria-label="Name"></td>
        <td><input class="cell" data-f="pan" value="${esc(a.pan)}" maxlength="10" style="text-transform:uppercase;font-family:var(--mono)" aria-label="PAN"></td>
        <td><input class="cell" data-f="notes" value="${esc(a.notes)}" aria-label="Notes"></td>
        <td><input type="checkbox" data-f="active" ${a.active !== false ? 'checked' : ''} aria-label="Active"></td>
        <td><button class="danger" data-del>Delete</button></td></tr>`).join('')
      : `<tr><td colspan="6" class="muted">${S.loaded.accounts ? 'No accounts yet. Add one above.' : 'Loading…'}</td></tr>`) + '</tbody>';
    $$('#accTable [data-f]').forEach((inp) => inp.addEventListener('change', async () => {
      const id = inp.closest('tr').dataset.id, f = inp.dataset.f;
      let v = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
      if (f === 'pan') v = v.toUpperCase();
      if (f === 'name' && !v) { toast('Name cannot be empty', true); renderAccounts(); return; }
      try { await db.collection('accounts').doc(id).update({ [f]: v }); toast('Saved'); } catch { toast('Could not save. Try again.', true); }
    }));
    $$('#accTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Confirm delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000); return; }
      const id = b.closest('tr').dataset.id; b.disabled = true;
      try {
        for (const [k, a] of S.apps) if (a.accountId === id) await db.collection('apps').doc(k).delete();
        await db.collection('accounts').doc(id).delete(); toast('Account deleted');
      } catch { toast('Could not delete. Try again.', true); }
    }));
  }

  // ---------- storage (this browser) + IPO feed (GitHub Actions → ipos.json) ----------
  const LS_KEY = 'findeependence-ipo-ledger-v1';
  let local = { accounts: {}, apps: {}, ipos: {}, meta: {} };
  let remote = {};
  let lsOk = true;
  function persist(isBackup) {
    local.meta = local.meta || {};
    if (isBackup) local.meta.lastBackup = new Date().toISOString(); else local.meta.lastChange = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(local)); }
    catch { lsOk = false; showStatus('This browser is not letting the app save data (private window or blocked storage). Changes will be lost when you close the tab.'); }
  }
  function refresh() {
    S.accounts = Object.entries(local.accounts).map(([id, v]) => ({ id, ...v }));
    S.apps = new Map(Object.entries(local.apps));
    const ipos = { ...remote };
    for (const [id, v] of Object.entries(local.ipos)) { if (v.__deleted) delete ipos[id]; else ipos[id] = { id, ...v }; }
    S.ipos = Object.values(ipos);
    backupNote();
    schedule();
  }
  // Remind to back up when there are changes newer than the last backup (and it's been 7+ days or never).
  function backupNote() {
    const m = local.meta || {}, hasData = Object.keys(local.apps).length > 0;
    const stale = !m.lastBackup || (Date.now() - new Date(m.lastBackup)) > 7 * 864e5;
    const show = hasData && m.lastChange && (!m.lastBackup || m.lastChange > m.lastBackup) && stale;
    $('#backupNote').hidden = !show;
    if (show) $('#backupText').textContent = m.lastBackup ? `Last backup was ${new Date(m.lastBackup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Download a fresh backup so your IPO history is safe.` : 'Your IPO history is saved only in this browser. Download a backup so it is safe.';
  }
  const ref = (c, id) => ({
    async set(v) { local[c][id] = JSON.parse(JSON.stringify(v)); persist(); refresh(); },
    async update(v) { if (!local[c][id]) throw new Error('missing'); local[c][id] = { ...local[c][id], ...v }; persist(); refresh(); },
    async delete() { if (c === 'ipos' && remote[id]) local.ipos[id] = { __deleted: true }; else delete local[c][id]; persist(); refresh(); },
  });
  db = { collection: (c) => ({ doc: (id) => ref(c, id) }) };
  downloads = true;

  function seedAccounts() {
    (window.DEFAULT_ACCOUNTS || []).forEach((name, i) => { local.accounts['a' + String(i + 1).padStart(2, '0')] = { name, pan: '', notes: '', active: true, order: i + 1 }; });
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const v = JSON.parse(raw); local = { accounts: v.accounts || {}, apps: v.apps || {}, ipos: v.ipos || {}, meta: v.meta || {} }; }
    else { seedAccounts(); persist(); }
  } catch { lsOk = false; seedAccounts(); showStatus('This browser is not letting the app save data (private window or blocked storage). Changes will be lost when you close the tab.'); }
  S.loaded.accounts = true; S.loaded.apps = true;
  refresh();

  fetch('ipos.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((feed) => {
      remote = {};
      for (const i of feed.ipos || []) remote[i.id] = i;
      S.feed = feed;
    })
    .catch(() => showStatus('Could not load the NSE IPO list. Reload the page; you can still add IPOs by hand in the IPOs tab.'))
    .finally(() => { S.loaded.ipos = true; refresh(); });

  // ---------- backup / restore ----------
  function doBackup() {
    persist(true);
    save(`FinDeependence-IPO-backup-${istToday()}.json`, new Blob([JSON.stringify({ app: 'findeependence-ipo-ledger', version: 1, savedAt: new Date().toISOString(), ...local }, null, 2)], { type: 'application/json' }));
    backupNote(); toast('Backup downloaded');
  }
  $('#backupBtn').addEventListener('click', doBackup);
  $('#backupNow').addEventListener('click', doBackup);
  // Ask the browser not to clear this site's storage on its own.
  try { navigator.storage?.persist?.(); } catch {}
  $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreBtn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#restoreFile').click(); } });
  $('#restoreFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const v = JSON.parse(await f.text());
      if (v.app !== 'findeependence-ipo-ledger' || !v.accounts) throw new Error('bad');
      local = { accounts: v.accounts || {}, apps: v.apps || {}, ipos: v.ipos || {}, meta: v.meta || {} };
      persist(true); refresh(); toast('Backup restored');
    } catch { toast('That file is not a FinDeependence IPO backup', true); }
  });
})();
