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
    const floor = ipo.type === 'SME' ? 3 : 1; // SME retail is fixed at 2 lots, so HNI needs 3+
    if (cat === 'SHNI') { const min = Math.max(Math.floor(200000 / a) + 1, floor), max = Math.floor(1000000 / a); return max >= min ? { min, max } : null; }
    if (cat === 'BHNI') return { min: Math.max(Math.floor(1000000 / a) + 1, floor), max: null };
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
        <span class="nm">${esc(i.name)} <span class="pill ${st}">${st}</span>${i.type === 'SME' ? ' <span class="pill SME">SME</span>' : ''}</span>
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
        <thead><tr><th>#</th><th>Account</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount blocked</th><th>Application no.</th><th>Remarks</th></tr></thead>
        <tbody>${rows.map((a, i) => rowHtml(ipo, a, i)).join('')}</tbody>
        <tfoot>${totalsHtml(ipo, rows)}</tfoot>
      </table></div>`;
    $$('.seg button', p).forEach((b) => b.addEventListener('click', () => saveApp(ipo, b.closest('tr').dataset.acc, { category: b.dataset.cat || null })));
    $$('input.lots', p).forEach((inp) => inp.addEventListener('change', () => saveApp(ipo, inp.closest('tr').dataset.acc, { lots: inp.value })));
    $$('input.rem', p).forEach((inp) => inp.addEventListener('change', () => saveApp(ipo, inp.closest('tr').dataset.acc, { remarks: inp.value })));
    $$('input.appno', p).forEach((inp) => inp.addEventListener('change', () => saveApp(ipo, inp.closest('tr').dataset.acc, { appNo: inp.value })));
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
      <td>${cat ? `<input class="appno${app?.appNo && dupKeys().has(normApp(app.appNo)) ? ' dup' : ''}" value="${esc(app?.appNo || '')}" maxlength="40" placeholder="Application no." aria-label="Application number" spellcheck="false" autocomplete="off">` : ''}</td>
      <td>${cat ? `<input class="rem" value="${esc(app?.remarks || '')}" placeholder="Optional" aria-label="Remarks">` : ''}</td>
    </tr>`;
  }
  function totalsHtml(ipo, rows) {
    const t = { s: 0, b: 0, lots: 0, shares: 0, amt: 0, nos: 0 };
    for (const a of rows) { const app = S.apps.get(appKey(ipo.id, a.id)); if (!app?.category) continue; app.category === 'SHNI' ? t.s++ : t.b++; if (app.appNo) t.nos++; const c = calc(ipo, app); t.lots += c.lots || 0; t.shares += c.shares || 0; t.amt += c.amount || 0; }
    return `<tr class="tot"><td></td><td>Total · ${t.s + t.b} accounts</td><td>${t.s} sHNI · ${t.b} bHNI</td><td class="num">${inr(t.lots)}</td><td class="num">${inr(t.shares)}</td><td class="num">${rs(t.amt)}</td><td class="${t.nos < t.s + t.b ? 'warn' : ''}">${t.nos} of ${t.s + t.b} entered</td><td></td></tr>`;
  }
  // Application numbers must be unique across every IPO and account (ignoring case and spaces).
  const normApp = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
  function dupKeys() {
    const seen = new Set(), dup = new Set();
    for (const a of S.apps.values()) { if (!a.category || !a.appNo) continue; const k = normApp(a.appNo); (seen.has(k) ? dup : seen).add(k); }
    return dup;
  }
  function findAppNo(no, exceptKey) {
    const k = normApp(no);
    for (const [key, a] of S.apps) if (key !== exceptKey && a.category && a.appNo && normApp(a.appNo) === k) return a;
    return null;
  }
  async function saveApp(ipo, accId, patch) {
    if (!db) return toast('Saving is unavailable right now', true);
    const k = appKey(ipo.id, accId);
    const cur = S.apps.get(k) || { ipoId: ipo.id, accountId: accId, category: null, lots: null, remarks: '' };
    const next = { ipoId: ipo.id, accountId: accId, category: cur.category || null, lots: cur.lots ?? null, remarks: cur.remarks || '', appNo: cur.appNo || '' };
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
    if ('appNo' in patch) {
      const v = String(patch.appNo).trim().replace(/\s+/g, ' ').slice(0, 40);
      const clash = v && findAppNo(v, k);
      if (clash) {
        const who = S.accounts.find((a) => a.id === clash.accountId)?.name || 'another account';
        const where = S.ipos.find((i) => i.id === clash.ipoId)?.name || 'another IPO';
        toast(`Application no. ${v} is already used for ${who} in ${where}. Each number can be used only once.`, true);
        renderPanel(); return;
      }
      next.appNo = v;
    }
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
  const filters = () => ({
    from: $('#rFrom').value, to: $('#rTo').value, ipo: $('#rIpo').value, acc: $('#rAcc').value, cat: $('#rCat').value,
    empty: $('#rEmpty').checked, q: $('#rQ').value.trim().toLowerCase(), type: $('#rType').value, st: $('#rSt').value,
    isort: $('#rSortIpo').value || 'open-desc', asort: $('#rSortAcc').value || 'list-asc',
  });
  // Sort keys shared by the IPO / account tables, the sort dropdowns and the exports.
  const IPO_SORTS = {
    'open-desc': 'Open date, newest first', 'open-asc': 'Open date, oldest first', 'close-desc': 'Close date, newest first', 'close-asc': 'Close date, oldest first',
    'name-asc': 'IPO name A–Z', 'name-desc': 'IPO name Z–A', 'amount-desc': 'Amount blocked, high to low', 'amount-asc': 'Amount blocked, low to high',
    'applied-desc': 'Accounts applied, most first', 'applied-asc': 'Accounts applied, fewest first', 'price-desc': 'Upper price, high to low', 'price-asc': 'Upper price, low to high',
  };
  const ACC_SORTS = {
    'list-asc': 'Account list order', 'name-asc': 'Account name A–Z', 'name-desc': 'Account name Z–A', 'amount-desc': 'Amount blocked, high to low',
    'amount-asc': 'Amount blocked, low to high', 'applied-desc': 'IPOs applied, most first', 'applied-asc': 'IPOs applied, fewest first',
  };
  function sortBy(list, key, get) {
    const [k, dir] = key.split('-'); const m = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const x = get(a, k), y = get(b, k);
      const r = typeof x === 'string' || typeof y === 'string' ? String(x ?? '').localeCompare(String(y ?? ''), 'en', { sensitivity: 'base' }) : (x ?? -Infinity) - (y ?? -Infinity);
      return r * m || String(get(a, 'name')).localeCompare(String(get(b, 'name')));
    });
  }
  function buildData(f) {
    let ipos = sortedIpos();
    if (f.ipo) ipos = ipos.filter((i) => i.id === f.ipo);
    if (f.from) ipos = ipos.filter((i) => (i.closeDate || i.openDate || '9999') >= f.from);
    if (f.to) ipos = ipos.filter((i) => (i.openDate || '0000') <= f.to);
    if (f.q) ipos = ipos.filter((i) => `${i.name} ${i.symbol || ''}`.toLowerCase().includes(f.q));
    if (f.type) ipos = ipos.filter((i) => (i.type || 'Mainboard') === f.type);
    if (f.st) ipos = ipos.filter((i) => status(i) === f.st);
    const applied = (ipoId, accId) => { const a = S.apps.get(appKey(ipoId, accId)); return a && a.category ? a : null; };
    if (!f.empty && !f.ipo) ipos = ipos.filter((i) => sortedAccounts().some((a) => applied(i.id, a.id)));
    let accounts = sortedAccounts().filter((a) => a.active !== false || ipos.some((i) => applied(i.id, a.id)));
    if (f.acc) accounts = accounts.filter((a) => a.id === f.acc);
    const cells = [];
    for (const ipo of ipos) for (const acc of accounts) {
      const app = applied(ipo.id, acc.id);
      const cat = app ? app.category : 'NONE';
      const c = app ? calc(ipo, app) : { lots: 0, shares: 0, amount: 0 };
      cells.push({ ipo, acc, cat, lots: c.lots, shares: c.shares, amount: c.amount, remarks: app?.remarks || '', appNo: app?.appNo || '' });
    }
    const shown = f.cat ? cells.filter((c) => c.cat === f.cat) : cells;
    const sum = (list) => {
      const t = { cells: list.length, shni: 0, bhni: 0, none: 0, lots: 0, shares: 0, amount: 0 };
      for (const c of list) { if (c.cat === 'SHNI') t.shni++; else if (c.cat === 'BHNI') t.bhni++; else t.none++; t.lots += c.lots || 0; t.shares += c.shares || 0; t.amount += c.amount || 0; }
      t.applied = t.shni + t.bhni; return t;
    };
    let byIpo = ipos.map((ipo) => { const list = shown.filter((c) => c.ipo === ipo); return { src: ipo, ipo: { ...ipo, status: status(ipo), lotAmount: lotAmt(ipo) }, list, t: sum(list) }; });
    byIpo = sortBy(byIpo, f.isort, (b, k) => ({ open: b.ipo.openDate, close: b.ipo.closeDate, name: b.ipo.name, amount: b.t.amount, applied: b.t.applied, price: b.ipo.priceHigh }[k]));
    ipos = byIpo.map((b) => b.src);
    const order = new Map(ipos.map((i, n) => [i, n]));
    const byOrder = (a, b) => order.get(a.ipo) - order.get(b.ipo);
    let byAcc = accounts.map((acc) => {
      const list = shown.filter((c) => c.acc === acc).sort(byOrder);
      const last = list.filter((c) => c.cat !== 'NONE').map((c) => c.ipo).sort((a, b) => String(b.openDate || '').localeCompare(String(a.openDate || '')))[0] || null;
      return { acc, list, t: sum(list), last };
    });
    byAcc = sortBy(byAcc, f.asort, (b, k) => ({ list: b.acc.order || 0, name: b.acc.name, amount: b.t.amount, applied: b.t.applied }[k]));
    accounts = byAcc.map((b) => b.acc);
    const aorder = new Map(accounts.map((a, n) => [a, n]));
    for (const b of byIpo) b.list.sort((x, y) => aorder.get(x.acc) - aorder.get(y.acc));
    const shownSorted = shown.slice().sort((x, y) => byOrder(x, y) || aorder.get(x.acc) - aorder.get(y.acc));
    return { f, ipos, accounts, cells, shown: shownSorted, byIpo, byAcc, g: sum(shown) };
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const typePill = (i) => (i.type === 'SME' ? '<span class="pill SME">SME</span>' : '<span class="pill MB">Main</span>');
  // Sortable header cell: shows ▲/▼ on the active sort column.
  let curSort = { ipo: 'open-desc', acc: 'list-asc' };
  const sh = (label, key, scope, cls = '', def = 'desc') => {
    const [k, dir] = (curSort[scope] || '').split('-');
    const on = k === key;
    return `<th class="${cls} sortable${on ? ' on' : ''}" data-sort="${key}" data-scope="${scope}" data-def="${def}" title="Sort by ${label}" aria-sort="${on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}<span class="arr">${on ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  };
  const pill = (cat) => `<span class="pill ${cat}">${CATN[cat] || cat}</span>`;
  let rView = store.get('rView') || 'ipo';
  $$('#rViews button').forEach((b) => b.addEventListener('click', () => { rView = b.dataset.rv; store.set('rView', rView); renderReport(); }));
  ['rFrom', 'rTo', 'rIpo', 'rAcc', 'rCat', 'rEmpty', 'rType', 'rSt', 'rSortIpo', 'rSortAcc'].forEach((id) => $('#' + id).addEventListener('change', renderReport));
  let qTimer; $('#rQ').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(renderReport, 200); });
  $('#rSortIpo').innerHTML = Object.entries(IPO_SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#rSortAcc').innerHTML = Object.entries(ACC_SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  try { $('#rSortIpo').value = store.get('rSortIpo') || 'open-desc'; $('#rSortAcc').value = store.get('rSortAcc') || 'list-asc'; } catch {}
  $('#rSortIpo').addEventListener('change', () => store.set('rSortIpo', $('#rSortIpo').value));
  $('#rSortAcc').addEventListener('change', () => store.set('rSortAcc', $('#rSortAcc').value));
  // Clickable column headers: first click sorts, second click reverses.
  $('#reportOut').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]'); if (!th) return;
    const sel = th.dataset.scope === 'acc' ? $('#rSortAcc') : $('#rSortIpo');
    const [k, dir] = sel.value.split('-');
    const def = th.dataset.def || 'desc';
    sel.value = `${th.dataset.sort}-${k === th.dataset.sort ? (dir === 'asc' ? 'desc' : 'asc') : def}`;
    store.set(sel.id, sel.value); renderReport();
  });
  $$('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const t = istToday();
    if (b.dataset.range === 'month') { $('#rFrom').value = t.slice(0, 8) + '01'; $('#rTo').value = t; }
    if (b.dataset.range === 'fy') { const y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 4 ? 1 : 0); $('#rFrom').value = `${y}-04-01`; $('#rTo').value = t; }
    if (b.dataset.range === 'last30') { $('#rFrom').value = addDays(t, -30); $('#rTo').value = t; }
    if (b.dataset.range === 'clear') { ['rFrom', 'rTo', 'rIpo', 'rAcc', 'rCat', 'rQ', 'rType', 'rSt'].forEach((id) => ($('#' + id).value = '')); }
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
    curSort = { ipo: d.f.isort, acc: d.f.asort };
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
        <thead><tr>${sh('IPO', 'name', 'ipo', '', 'asc')}<th>Type</th>${sh('Open', 'open', 'ipo')}${sh('Close', 'close', 'ipo')}<th>Status</th>${sh('Upper price', 'price', 'ipo', 'num')}<th class="num">Lot</th>${sh('Applied', 'applied', 'ipo', 'num')}<th class="num">sHNI</th><th class="num">bHNI</th><th class="num">None</th><th class="num">Lots</th><th class="num">Shares</th>${sh('Amount blocked', 'amount', 'ipo', 'num')}</tr></thead>
        <tbody>${d.byIpo.map((b) => `<tr><td>${ipoLink(b.ipo)}</td><td>${typePill(b.ipo)}</td><td>${fd(b.ipo.openDate)}</td><td>${fd(b.ipo.closeDate)}</td><td>${pill(b.ipo.status)}</td><td class="num">${rs(b.ipo.priceHigh)}</td><td class="num">${inr(b.ipo.lotSize)}</td><td class="num">${b.t.applied} / ${b.t.cells}</td><td class="num">${b.t.shni}</td><td class="num">${b.t.bhni}</td><td class="num">${b.t.none}</td><td class="num">${inr(b.t.lots)}</td><td class="num">${inr(b.t.shares)}</td><td class="num">${rs(b.t.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num">${g.applied} / ${g.cells}</td><td class="num">${g.shni}</td><td class="num">${g.bhni}</td><td class="num">${g.none}</td><td class="num">${inr(g.lots)}</td><td class="num">${inr(g.shares)}</td><td class="num">${rs(g.amount)}</td></tr></tfoot></table></div>
        <h3 class="sec">Accounts in each IPO</h3>
        ${d.byIpo.map((b) => `<details class="blk" ${d.f.ipo ? 'open' : ''}><summary><span>${esc(b.ipo.name)}</span><span class="muted">${b.t.shni} sHNI · ${b.t.bhni} bHNI · ${b.t.none} None · <span class="num">${rs(b.t.amount)}</span></span></summary>
          <div class="tbl"><table><thead><tr><th>Account</th><th>PAN</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount</th><th>Application no.</th><th>Remarks</th></tr></thead>
          <tbody>${b.list.map((c) => `<tr class="${c.cat === 'NONE' ? 'none-row' : 'c-' + c.cat}"><td>${accLink(c.acc)}</td><td class="mono">${esc(c.acc.pan || '')}</td><td>${pill(c.cat)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.lots)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.shares)}</td><td class="num">${c.cat === 'NONE' ? '–' : rs(c.amount)}</td><td class="mono">${esc(c.appNo) || (c.cat === 'NONE' ? '' : '<span class="muted">–</span>')}</td><td>${esc(c.remarks)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
    } else if (rView === 'acc') {
      body = `<h3 class="sec">Account-wise · which IPOs each account applied in</h3><div class="tbl"><table>
        <thead><tr>${sh('#', 'list', 'acc', 'num', 'asc')}${sh('Account', 'name', 'acc', '', 'asc')}<th>PAN</th>${sh('IPOs applied', 'applied', 'acc', 'num')}<th class="num">sHNI</th><th class="num">bHNI</th><th class="num">None</th><th class="num">Hit rate</th>${sh('Amount blocked', 'amount', 'acc', 'num')}<th>Last applied in</th></tr></thead>
        <tbody>${d.byAcc.map((b, i) => `<tr><td class="num">${i + 1}</td><td>${accLink(b.acc)}</td><td class="mono">${esc(b.acc.pan || '')}</td><td class="num">${b.t.applied} / ${b.t.cells}</td><td class="num">${b.t.shni}</td><td class="num">${b.t.bhni}</td><td class="num">${b.t.none}</td><td class="num">${pct(b.t.applied, b.t.cells)}</td><td class="num">${rs(b.t.amount)}</td><td>${b.last ? esc(b.last.name) : '–'}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td></td><td>Total</td><td></td><td class="num">${g.applied} / ${g.cells}</td><td class="num">${g.shni}</td><td class="num">${g.bhni}</td><td class="num">${g.none}</td><td class="num">${pct(g.applied, g.cells)}</td><td class="num">${rs(g.amount)}</td><td></td></tr></tfoot></table></div>
        <h3 class="sec">IPO history of each account</h3>
        ${d.byAcc.map((b) => `<details class="blk" ${d.f.acc ? 'open' : ''}><summary><span>${esc(b.acc.name)}</span><span class="muted">${b.t.applied} IPOs · ${b.t.shni} sHNI · ${b.t.bhni} bHNI · <span class="num">${rs(b.t.amount)}</span></span></summary>
          <div class="tbl"><table><thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Upper price</th><th class="num">Amount</th><th>Application no.</th><th>Remarks</th></tr></thead>
          <tbody>${b.list.map((c) => `<tr class="${c.cat === 'NONE' ? 'none-row' : 'c-' + c.cat}"><td>${ipoLink(c.ipo)}</td><td>${fd(c.ipo.openDate)}</td><td>${fd(c.ipo.closeDate)}</td><td>${pill(c.cat)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.lots)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.shares)}</td><td class="num">${rs(c.ipo.priceHigh)}</td><td class="num">${c.cat === 'NONE' ? '–' : rs(c.amount)}</td><td class="mono">${esc(c.appNo) || (c.cat === 'NONE' ? '' : '<span class="muted">–</span>')}</td><td>${esc(c.remarks)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
    } else if (rView === 'matrix') {
      const cellOf = (ipo, acc) => d.shown.find((c) => c.ipo === ipo && c.acc === acc);
      const mark = (c) => (!c ? '' : c.cat === 'SHNI' ? '<span class="mx s">S</span>' : c.cat === 'BHNI' ? '<span class="mx b">B</span>' : '<span class="mx n">–</span>');
      body = `<h3 class="sec">Matrix · accounts × IPOs</h3><div class="legend"><span><span class="mx s">S</span> sHNI</span><span><span class="mx b">B</span> bHNI</span><span><span class="mx n">–</span> None</span></div><div class="tbl matrix"><table>
        <thead><tr><th class="stick">Account</th>${d.ipos.map((i) => `<th class="rot" title="${esc(i.name)}"><a href="#" class="go" data-go-ipo="${esc(i.id)}">${esc(i.symbol || i.name.split(' ')[0])}</a><div class="muted">${fd(i.openDate).slice(0, 6)}</div></th>`).join('')}<th class="num">S</th><th class="num">B</th><th class="num">–</th></tr></thead>
        <tbody>${d.byAcc.map((b) => `<tr><td class="stick">${accLink(b.acc)}</td>${d.ipos.map((i) => `<td class="mxc">${mark(cellOf(i, b.acc))}</td>`).join('')}<td class="num">${b.t.shni}</td><td class="num">${b.t.bhni}</td><td class="num">${b.t.none}</td></tr>`).join('')}</tbody>
        <tfoot>${[['sHNI', 'shni'], ['bHNI', 'bhni'], ['None', 'none']].map(([l, k]) => `<tr class="tot"><td class="stick">${l}</td>${d.byIpo.map((b) => `<td class="num">${b.t[k]}</td>`).join('')}<td class="num">${k === 'shni' ? g.shni : ''}</td><td class="num">${k === 'bhni' ? g.bhni : ''}</td><td class="num">${k === 'none' ? g.none : ''}</td></tr>`).join('')}</tfoot></table></div>`;
    } else {
      body = `<h3 class="sec">All rows · every IPO × account (${d.shown.length})</h3><div class="tbl"><table>
        <thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Account</th><th>PAN</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Upper price</th><th class="num">Amount</th><th>Application no.</th><th>Remarks</th></tr></thead>
        <tbody>${d.shown.map((c) => `<tr class="${c.cat === 'NONE' ? 'none-row' : 'c-' + c.cat}"><td>${ipoLink(c.ipo)}</td><td>${fd(c.ipo.openDate)}</td><td>${fd(c.ipo.closeDate)}</td><td>${accLink(c.acc)}</td><td class="mono">${esc(c.acc.pan || '')}</td><td>${pill(c.cat)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.lots)}</td><td class="num">${c.cat === 'NONE' ? '–' : inr(c.shares)}</td><td class="num">${rs(c.ipo.priceHigh)}</td><td class="num">${c.cat === 'NONE' ? '–' : rs(c.amount)}</td><td class="mono">${esc(c.appNo) || (c.cat === 'NONE' ? '' : '<span class="muted">–</span>')}</td><td>${esc(c.remarks)}</td></tr>`).join('')}</tbody></table></div>`;
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

  // ---------- Excel export (ExcelJS: real styles + conditional formatting) ----------
  const XL = {
    navy: 'FF0E2740', teal: 'FF2C8F93', pen: 'FF1D5FA8', green: 'FF3C9A08', ink: 'FF14273D', muted: 'FF5D6B7A',
    cream: 'FFF6F2E8', chip: 'FFEAE3D2', line: 'FFE2DACA', white: 'FFFFFFFF', mint: 'FF7FD3D6',
    sFill: 'FFCFEAEA', sFont: 'FF135A5D', sRow: 'FFEEF7F7',
    bFill: 'FFD3E2F5', bFont: 'FF123F75', bRow: 'FFF0F5FC',
    nFill: 'FFF0ECE4', nFont: 'FF8C9096',
    openFill: 'FFDDF0D2', openFont: 'FF2E7406', soonFill: 'FFFBEBD3', soonFont: 'FF8A5300',
  };
  // Indian digit grouping (12,34,567) for rupee amounts.
  const INR_FMT = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
  const DATE_FMT = 'dd-mmm-yyyy';
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const toDate = (s) => (s ? new Date(s + 'T00:00:00Z') : null);
  const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const thin = { style: 'thin', color: { argb: XL.line } };

  function xlSheet(wb, name, title, d, cols, opts = {}) {
    const ws = wb.addWorksheet(name, {
      properties: { tabColor: { argb: opts.tab || XL.navy } },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: '&L&8FinDeependence · HNI IPO Ledger&R&8Page &P of &N' },
    });
    ws.columns = cols.map((c) => ({ key: c.key, width: c.w }));
    const n = cols.length;
    // Row 1: brand band
    ws.mergeCells(1, 1, 1, n);
    const t = ws.getCell(1, 1);
    t.value = { richText: [{ text: 'FINDEEPENDENCE   ', font: { bold: true, size: 9, color: { argb: XL.mint }, name: 'Calibri' } }, { text: title, font: { bold: true, size: 15, color: { argb: XL.white }, name: 'Calibri' } }] };
    t.fill = fill(XL.navy); t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 30;
    // Row 2: context line
    ws.mergeCells(2, 1, 2, n);
    const sc = scopeText(d.f);
    const c2 = ws.getCell(2, 1);
    c2.value = `CA Deep Dalal · Chartered Accountant · Fund Manager   |   Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST   |   ${sc || 'All IPOs and accounts'}   |   Amounts in ₹ at upper price band`;
    c2.font = { size: 9, color: { argb: XL.muted }, italic: true }; c2.fill = fill(XL.cream); c2.alignment = { indent: 1, vertical: 'middle' };
    ws.getRow(2).height = 18;
    // Row 3: legend
    const lg = [['sHNI', XL.sFill, XL.sFont], ['bHNI', XL.bFill, XL.bFont], ['None', XL.nFill, XL.nFont]];
    const l0 = ws.getCell(3, 1); l0.value = opts.legendLabel || 'Colour key'; l0.font = { bold: true, size: 9, color: { argb: XL.muted } }; l0.alignment = { horizontal: 'right', indent: 1 };
    lg.forEach(([txt, f, fc], i) => { const c = ws.getCell(3, 2 + i); c.value = opts.matrix ? `${txt[0] === 'N' ? '–' : txt[0]} = ${txt}` : txt; c.fill = fill(f); c.font = { bold: true, size: 9, color: { argb: fc } }; c.alignment = { horizontal: 'center' }; c.border = { top: thin, left: thin, bottom: thin, right: thin }; });
    if (opts.note) { const c = ws.getCell(3, 6); c.value = opts.note; c.font = { size: 9, color: { argb: XL.muted }, italic: true }; }
    // Row 5: header
    const H = 5;
    const hr = ws.getRow(H);
    cols.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.h; cell.font = { bold: true, color: { argb: XL.white }, size: 10 }; cell.fill = fill(c.hFill || XL.navy); cell.alignment = { vertical: 'middle', horizontal: c.num ? 'right' : c.center ? 'center' : 'left', wrapText: true }; cell.border = { right: { style: 'thin', color: { argb: 'FF2B4560' } } }; });
    hr.height = opts.headerHeight || 32;
    return { ws, H, n };
  }
  function xlRows(ws, H, cols, rows) {
    rows.forEach((r, i) => {
      const row = ws.getRow(H + 1 + i);
      cols.forEach((c, j) => {
        const cell = row.getCell(j + 1);
        let v = r[c.key];
        if (c.date) v = toDate(v);
        cell.value = v ?? (c.num ? null : '');
        if (c.date) cell.numFmt = DATE_FMT;
        if (c.text) { cell.numFmt = '@'; cell.value = v == null ? '' : String(v); }
        if (c.fmt) cell.numFmt = c.fmt;
        cell.alignment = { horizontal: c.num ? 'right' : c.center ? 'center' : 'left', vertical: 'middle' };
        cell.border = { bottom: thin };
        cell.font = { size: 10, color: { argb: XL.ink }, ...(c.bold ? { bold: true } : {}) };
      });
      row.height = 18;
    });
    return H + rows.length; // last data row
  }
  function xlTotals(ws, row, cols, H, last, label, extra = {}) {
    const r = ws.getRow(row);
    cols.forEach((c, j) => {
      const cell = r.getCell(j + 1);
      const L = colL(j + 1);
      if (j === 0) cell.value = label;
      else if (extra[c.key] !== undefined) cell.value = extra[c.key];
      else if (c.sum && last > H) cell.value = { formula: `SUBTOTAL(109,${L}${H + 1}:${L}${last})` };
      if (c.fmt) cell.numFmt = c.fmt;
      cell.font = { bold: true, size: 10, color: { argb: XL.ink } }; cell.fill = fill(XL.chip);
      cell.alignment = { horizontal: c.num ? 'right' : c.center ? 'center' : 'left' };
      cell.border = { top: { style: 'medium', color: { argb: XL.navy } }, bottom: { style: 'medium', color: { argb: XL.navy } } };
    });
    r.height = 20;
  }
  // Category colour rules: strong fill on the category cell, light tint across the row.
  function cfCategory(ws, ref, values = { s: 'sHNI', b: 'bHNI', n: 'None' }) {
    ws.addConditionalFormatting({ ref, rules: [
      { type: 'cellIs', operator: 'equal', formulae: [`"${values.s}"`], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.sFill } }, font: { bold: true, color: { argb: XL.sFont } } } },
      { type: 'cellIs', operator: 'equal', formulae: [`"${values.b}"`], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.bFill } }, font: { bold: true, color: { argb: XL.bFont } } } },
      { type: 'cellIs', operator: 'equal', formulae: [`"${values.n}"`], priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.nFill } }, font: { color: { argb: XL.nFont } } } },
    ] });
  }
  function cfRowTint(ws, ref, catCol, firstRow) {
    ws.addConditionalFormatting({ ref, rules: [
      { type: 'expression', formulae: [`$${catCol}${firstRow}="sHNI"`], priority: 10, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.sRow } } } },
      { type: 'expression', formulae: [`$${catCol}${firstRow}="bHNI"`], priority: 11, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.bRow } } } },
      { type: 'expression', formulae: [`$${catCol}${firstRow}="None"`], priority: 12, style: { font: { color: { argb: XL.nFont } } } },
    ] });
  }
  function cfCount(ws, ref, fillArgb, fontArgb) {
    ws.addConditionalFormatting({ ref, rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 20, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: fillArgb } }, font: { bold: true, color: { argb: fontArgb } } } }] });
  }
  function cfStatus(ws, ref) {
    ws.addConditionalFormatting({ ref, rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Open"'], priority: 30, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.openFill } }, font: { bold: true, color: { argb: XL.openFont } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Upcoming"'], priority: 31, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.soonFill } }, font: { bold: true, color: { argb: XL.soonFont } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Closed"'], priority: 32, style: { font: { color: { argb: XL.muted } } } },
    ] });
  }
  // Application numbers: stored as text, duplicates highlighted red and blocked by data validation.
  function cfDupAppNo(ws, col, first, last) {
    const rng = `$${col}$${first}:$${col}$${last}`;
    ws.addConditionalFormatting({ ref: `${col}${first}:${col}${last}`, rules: [{ type: 'expression', formulae: [`AND(${col}${first}<>"",COUNTIF(${rng},${col}${first})>1)`], priority: 0, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7D5' } }, font: { bold: true, color: { argb: 'FFB3261E' } } } }] });
    for (let r = first; r <= last; r++) {
      ws.getCell(`${col}${r}`).dataValidation = { type: 'custom', allowBlank: true, formulae: [`COUNTIF(${rng},${col}${r})<=1`], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Duplicate application number', error: 'This application number is already used in another row. Each number can be used only once.' };
    }
  }
  const freeze = (ws, H, xSplit = 1) => { ws.views = [{ state: 'frozen', xSplit, ySplit: H, showGridLines: false, zoomScale: 100 }]; };
  const autoF = (ws, H, last, n) => { if (last > H) ws.autoFilter = { from: { row: H, column: 1 }, to: { row: last, column: n } }; };

  async function buildWorkbook(d) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'FinDeependence · CA Deep Dalal'; wb.created = new Date(); wb.title = 'HNI IPO Ledger';
    const g = d.g;

    // 1. Dashboard
    {
      const cols = [{ h: '', key: 'a', w: 30 }, { h: '', key: 'b', w: 18 }, { h: '', key: 'c', w: 18 }, { h: '', key: 'd', w: 18 }, { h: '', key: 'e', w: 22 }, { h: '', key: 'f', w: 40 }];
      const { ws } = xlSheet(wb, 'Dashboard', 'IPO Application Report · sHNI / bHNI', d, cols, { tab: XL.green });
      ws.getRow(5).values = []; ws.getRow(5).height = 8;
      for (let c = 1; c <= 6; c++) { ws.getRow(5).getCell(c).fill = fill(XL.white); ws.getRow(5).getCell(c).border = {}; }
      const kpi = [['IPOs in report', d.ipos.length, null], ['Accounts', d.accounts.length, null], ['Applications (sHNI + bHNI)', g.applied, null], ['Hit rate (applied ÷ slots)', g.cells ? g.applied / g.cells : 0, '0%'], ['Application numbers entered', `${d.shown.filter((c) => c.cat !== 'NONE' && c.appNo).length} of ${g.applied}`, null], ['Total lots', g.lots, INR_FMT], ['Total shares', g.shares, INR_FMT], ['Amount blocked (₹)', g.amount, INR_FMT]];
      let r = 6;
      ws.getCell(r, 1).value = 'KEY NUMBERS'; ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: XL.teal } }; r++;
      for (const [label, v, fmt] of kpi) {
        const a = ws.getCell(r, 1), b = ws.getCell(r, 2);
        a.value = label; a.font = { size: 10, color: { argb: XL.muted } }; a.border = { bottom: thin };
        b.value = v; b.font = { bold: true, size: 14, color: { argb: XL.ink } }; b.alignment = { horizontal: 'right' }; b.border = { bottom: thin }; if (fmt) b.numFmt = fmt;
        ws.getRow(r).height = 22; r++;
      }
      r++;
      ws.getCell(r, 1).value = 'CATEGORY SPLIT'; ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: XL.teal } }; r++;
      const hdr = ['Category', 'Applications', 'Share of slots', 'Lots', 'Amount blocked (₹)'];
      hdr.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { bold: true, color: { argb: XL.white } }; c.fill = fill(XL.navy); c.alignment = { horizontal: i ? 'right' : 'left' }; });
      r++;
      const split = { SHNI: { n: 0, lots: 0, amt: 0 }, BHNI: { n: 0, lots: 0, amt: 0 }, NONE: { n: 0, lots: 0, amt: 0 } };
      for (const c of d.shown) { const x = split[c.cat]; x.n++; x.lots += c.lots || 0; x.amt += c.amount || 0; }
      const first = r;
      for (const k of ['SHNI', 'BHNI', 'NONE']) {
        const vals = [CATN[k], split[k].n, g.cells ? split[k].n / g.cells : 0, split[k].lots, split[k].amt];
        vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = { bottom: thin }; c.alignment = { horizontal: i ? 'right' : 'center' }; if (i === 2) c.numFmt = '0%'; if (i >= 3) c.numFmt = INR_FMT; });
        r++;
      }
      cfCategory(ws, `A${first}:A${r - 1}`);
      r++;
      ws.getCell(r, 1).value = 'SHEETS IN THIS WORKBOOK'; ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: XL.teal } }; r++;
      for (const [s, txt] of [['IPO-wise', 'One row per IPO: accounts applied, sHNI / bHNI / None counts, lots, shares, amount blocked.'], ['Account-wise', 'One row per account: IPOs applied, sHNI / bHNI / None, hit rate, amount blocked.'], ['Matrix', 'Accounts × IPOs grid, S / B / – colour-coded, with counts that update if you change a cell.'], ['All rows', 'Every IPO × account pair. Use the header filters to sort A–Z, by open/close date, or to pick sHNI / bHNI / None.']]) {
        ws.getCell(r, 1).value = s; ws.getCell(r, 1).font = { bold: true, color: { argb: XL.ink } };
        ws.mergeCells(r, 2, r, 6); ws.getCell(r, 2).value = txt; ws.getCell(r, 2).font = { size: 10, color: { argb: XL.muted } }; r++;
      }
      ws.views = [{ showGridLines: false }];
    }

    // 2. IPO-wise
    {
      const cols = [
        { h: 'IPO', key: 'name', w: 38, bold: true }, { h: 'Symbol', key: 'symbol', w: 12 }, { h: 'Type', key: 'type', w: 11, center: true }, { h: 'Status', key: 'status', w: 11, center: true },
        { h: 'Open', key: 'open', w: 13, date: true, center: true }, { h: 'Close', key: 'close', w: 13, date: true, center: true },
        { h: 'Price low ₹', key: 'low', w: 10, num: true, fmt: INR_FMT }, { h: 'Upper price ₹', key: 'high', w: 11, num: true, fmt: INR_FMT }, { h: 'Lot size', key: 'lot', w: 9, num: true, fmt: INR_FMT }, { h: '1 lot ₹', key: 'lotAmt', w: 11, num: true, fmt: INR_FMT },
        { h: 'Accounts', key: 'cells', w: 9, num: true, sum: true }, { h: 'Applied', key: 'applied', w: 9, num: true, sum: true },
        { h: 'sHNI', key: 'shni', w: 8, num: true, sum: true, hFill: XL.teal }, { h: 'bHNI', key: 'bhni', w: 8, num: true, sum: true, hFill: XL.pen }, { h: 'None', key: 'none', w: 8, num: true, sum: true, hFill: 'FF8C9096' },
        { h: 'Hit rate', key: 'hit', w: 9, num: true, fmt: '0%' }, { h: 'Lots', key: 'lots', w: 9, num: true, sum: true, fmt: INR_FMT }, { h: 'Shares', key: 'shares', w: 11, num: true, sum: true, fmt: INR_FMT }, { h: 'Amount blocked ₹', key: 'amount', w: 17, num: true, sum: true, fmt: INR_FMT },
      ];
      const { ws, H, n } = xlSheet(wb, 'IPO-wise', 'IPO-wise summary', d, cols, { note: 'Use the ▼ header filters to sort by name, open or close date, amount or status. Totals follow the filter.' });
      const rows = d.byIpo.map((b) => ({ name: b.ipo.name, symbol: b.ipo.symbol || '', type: b.ipo.type || 'Mainboard', status: b.ipo.status, open: b.ipo.openDate, close: b.ipo.closeDate, low: b.ipo.priceLow, high: b.ipo.priceHigh, lot: b.ipo.lotSize, lotAmt: b.ipo.lotAmount || null, cells: b.t.cells, applied: b.t.applied, shni: b.t.shni, bhni: b.t.bhni, none: b.t.none, hit: b.t.cells ? b.t.applied / b.t.cells : 0, lots: b.t.lots, shares: b.t.shares, amount: b.t.amount }));
      const last = xlRows(ws, H, cols, rows);
      xlTotals(ws, last + 1, cols, H, last, 'TOTAL', { hit: last > H ? { formula: `IFERROR(SUBTOTAL(109,L${H + 1}:L${last})/SUBTOTAL(109,K${H + 1}:K${last}),0)` } : 0 });
      if (last > H) {
        cfCount(ws, `M${H + 1}:M${last}`, XL.sFill, XL.sFont); cfCount(ws, `N${H + 1}:N${last}`, XL.bFill, XL.bFont);
        ws.addConditionalFormatting({ ref: `O${H + 1}:O${last}`, rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 22, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.nFill } }, font: { color: { argb: XL.nFont } } } }] });
        cfStatus(ws, `D${H + 1}:D${last}`);
        ws.addConditionalFormatting({ ref: `C${H + 1}:C${last}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['"SME"'], priority: 40, style: { font: { bold: true, color: { argb: XL.pen } } } }] });
      }
      freeze(ws, H, 1); autoF(ws, H, last, n);
    }

    // 3. Account-wise
    {
      const cols = [
        { h: '#', key: 'no', w: 5, num: true }, { h: 'Account', key: 'name', w: 30, bold: true }, { h: 'PAN', key: 'pan', w: 13 },
        { h: 'IPOs in scope', key: 'cells', w: 10, num: true, sum: true }, { h: 'IPOs applied', key: 'applied', w: 10, num: true, sum: true },
        { h: 'sHNI', key: 'shni', w: 8, num: true, sum: true, hFill: XL.teal }, { h: 'bHNI', key: 'bhni', w: 8, num: true, sum: true, hFill: XL.pen }, { h: 'None', key: 'none', w: 8, num: true, sum: true, hFill: 'FF8C9096' },
        { h: 'Hit rate', key: 'hit', w: 9, num: true, fmt: '0%' }, { h: 'Amount blocked ₹', key: 'amount', w: 17, num: true, sum: true, fmt: INR_FMT }, { h: 'Last applied in', key: 'last', w: 36 },
      ];
      const { ws, H, n } = xlSheet(wb, 'Account-wise', 'Account-wise summary', d, cols, { note: 'Sort by name, IPOs applied or amount with the ▼ header filters.' });
      const rows = d.byAcc.map((b, i) => ({ no: i + 1, name: b.acc.name, pan: b.acc.pan || '', cells: b.t.cells, applied: b.t.applied, shni: b.t.shni, bhni: b.t.bhni, none: b.t.none, hit: b.t.cells ? b.t.applied / b.t.cells : 0, amount: b.t.amount, last: b.last?.name || '–' }));
      const last = xlRows(ws, H, cols, rows);
      xlTotals(ws, last + 1, cols, H, last, '', { name: 'TOTAL', hit: last > H ? { formula: `IFERROR(SUBTOTAL(109,E${H + 1}:E${last})/SUBTOTAL(109,D${H + 1}:D${last}),0)` } : 0 });
      if (last > H) {
        cfCount(ws, `F${H + 1}:F${last}`, XL.sFill, XL.sFont); cfCount(ws, `G${H + 1}:G${last}`, XL.bFill, XL.bFont);
        ws.addConditionalFormatting({ ref: `H${H + 1}:H${last}`, rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 22, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.nFill } }, font: { color: { argb: XL.nFont } } } }] });
        ws.addConditionalFormatting({ ref: `I${H + 1}:I${last}`, rules: [{ type: 'colorScale', priority: 50, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FF9FD3D4' }] }] });
      }
      freeze(ws, H, 2); autoF(ws, H, last, n);
    }

    // 4. Matrix (S / B / –) with live COUNTIF totals
    {
      const ipoCols = d.ipos.map((i, k) => ({ h: `${i.name}\n${fdx(i.openDate)}${i.type === 'SME' ? ' · SME' : ''}`, key: 'i' + k, w: 13, center: true }));
      const cols = [{ h: 'Account', key: 'name', w: 30, bold: true }, ...ipoCols, { h: 'sHNI', key: 'cs', w: 7, num: true, hFill: XL.teal }, { h: 'bHNI', key: 'cb', w: 7, num: true, hFill: XL.pen }, { h: 'None', key: 'cn', w: 7, num: true, hFill: 'FF8C9096' }];
      const { ws, H, n } = xlSheet(wb, 'Matrix', 'Matrix · accounts × IPOs', d, cols, { matrix: true, headerHeight: 78, note: 'Read across for an account\'s IPO history, down for who applied in an IPO.' });
      ws.getRow(H).eachCell((c, j) => { if (j > 1 && j <= 1 + d.ipos.length) c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }; });
      const cellOf = new Map(d.shown.map((c) => [c.ipo.id + '|' + c.acc.id, c]));
      const m = d.ipos.length, first = H + 1, lastData = H + d.accounts.length;
      const A = colL(2), Z = colL(1 + m);
      const rows = d.byAcc.map((b) => {
        const r = { name: b.acc.name };
        d.ipos.forEach((i, k) => { const c = cellOf.get(i.id + '|' + b.acc.id); r['i' + k] = !c ? '' : c.cat === 'SHNI' ? 'S' : c.cat === 'BHNI' ? 'B' : '–'; });
        return r;
      });
      xlRows(ws, H, cols, rows);
      rows.forEach((_, i) => {
        const R = first + i, row = ws.getRow(R);
        [['cs', 'S'], ['cb', 'B'], ['cn', '–']].forEach(([key, v], j) => { const cell = row.getCell(2 + m + j); cell.value = m ? { formula: `COUNTIF(${A}${R}:${Z}${R},"${v}")` } : 0; cell.font = { bold: true, size: 10 }; cell.alignment = { horizontal: 'right' }; });
      });
      [['sHNI', 'S'], ['bHNI', 'B'], ['None', '–']].forEach(([label, v], k) => {
        const R = lastData + 1 + k, row = ws.getRow(R);
        row.getCell(1).value = `${label} count`;
        for (let j = 0; j < m; j++) { const L = colL(2 + j); row.getCell(2 + j).value = { formula: `COUNTIF(${L}${first}:${L}${lastData},"${v}")` }; }
        const tot = row.getCell(2 + m + k); tot.value = { formula: `SUM(${colL(2 + m + k)}${first}:${colL(2 + m + k)}${lastData})` };
        for (let j = 1; j <= n; j++) { const c = row.getCell(j); c.font = { bold: true, size: 10, color: { argb: XL.ink } }; c.fill = fill(XL.chip); c.alignment = { horizontal: j === 1 ? 'left' : 'center' }; c.border = { top: k === 0 ? { style: 'medium', color: { argb: XL.navy } } : thin }; }
      });
      if (m && lastData >= first) {
        ws.addConditionalFormatting({ ref: `${A}${first}:${Z}${lastData}`, rules: [
          { type: 'cellIs', operator: 'equal', formulae: ['"S"'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF2C8F93' } }, font: { bold: true, color: { argb: XL.white } } } },
          { type: 'cellIs', operator: 'equal', formulae: ['"B"'], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF1D5FA8' } }, font: { bold: true, color: { argb: XL.white } } } },
          { type: 'cellIs', operator: 'equal', formulae: ['"–"'], priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: XL.nFill } }, font: { color: { argb: XL.nFont } } } },
        ] });
        ws.getColumn(1).eachCell((c, r) => { if (r >= first && r <= lastData) c.border = { bottom: thin, right: { style: 'thin', color: { argb: XL.line } } }; });
        for (let R = first; R <= lastData; R++) for (let j = 2; j <= 1 + m; j++) ws.getRow(R).getCell(j).border = { bottom: { style: 'thin', color: { argb: XL.white } }, right: { style: 'thin', color: { argb: XL.white } } };
      }
      // Legend cells use the same strong colours as the grid.
      [['S = sHNI', 'FF2C8F93'], ['B = bHNI', 'FF1D5FA8']].forEach(([txt, f], i) => { const c = ws.getCell(3, 2 + i); c.value = txt; c.fill = fill(f); c.font = { bold: true, size: 9, color: { argb: XL.white } }; });
      freeze(ws, H, 1); autoF(ws, H, lastData, 1 + m);
    }

    // 5. All rows
    {
      const cols = [
        { h: 'IPO', key: 'ipo', w: 36, bold: true }, { h: 'Symbol', key: 'symbol', w: 12 }, { h: 'Type', key: 'type', w: 11, center: true }, { h: 'Status', key: 'status', w: 11, center: true },
        { h: 'Open', key: 'open', w: 13, date: true, center: true }, { h: 'Close', key: 'close', w: 13, date: true, center: true },
        { h: 'Account', key: 'acc', w: 28 }, { h: 'PAN', key: 'pan', w: 13 }, { h: 'Category', key: 'cat', w: 11, center: true }, { h: 'Application no.', key: 'appNo', w: 20, text: true },
        { h: 'Lots', key: 'lots', w: 8, num: true, sum: true, fmt: INR_FMT }, { h: 'Shares', key: 'shares', w: 10, num: true, sum: true, fmt: INR_FMT }, { h: 'Upper price ₹', key: 'price', w: 11, num: true, fmt: INR_FMT },
        { h: 'Amount blocked ₹', key: 'amount', w: 17, num: true, sum: true, fmt: INR_FMT }, { h: 'Remarks', key: 'remarks', w: 26 },
      ];
      const { ws, H, n } = xlSheet(wb, 'All rows', 'All rows · every IPO × account', d, cols, { note: 'Filter Category to sHNI / bHNI / None; sort IPO A–Z or by open / close date. Totals follow the filter.' });
      const rows = d.shown.map((c) => ({ ipo: c.ipo.name, symbol: c.ipo.symbol || '', type: c.ipo.type || 'Mainboard', status: status(c.ipo), open: c.ipo.openDate, close: c.ipo.closeDate, acc: c.acc.name, pan: c.acc.pan || '', cat: CATN[c.cat], appNo: c.appNo || '', lots: c.lots || 0, shares: c.shares || 0, price: c.ipo.priceHigh ?? null, amount: c.amount || 0, remarks: c.remarks }));
      const last = xlRows(ws, H, cols, rows);
      xlTotals(ws, last + 1, cols, H, last, 'TOTAL', { cat: last > H ? { formula: `SUBTOTAL(103,I${H + 1}:I${last})&" rows"` } : '' });
      if (last > H) {
        cfRowTint(ws, `A${H + 1}:${colL(n)}${last}`, 'I', H + 1); cfCategory(ws, `I${H + 1}:I${last}`); cfStatus(ws, `D${H + 1}:D${last}`);
        cfDupAppNo(ws, 'J', H + 1, last);
      }
      freeze(ws, H, 1); autoF(ws, H, last, n);
    }
    return wb;
  }
  $('#dlXlsx').addEventListener('click', async () => {
    if (!window.ExcelJS) return toast('Excel library did not load. Reload the page.', true);
    const btn = $('#dlXlsx'); btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      const wb = await buildWorkbook(buildData(filters()));
      save(`FinDeependence-IPO-Report-${fileStamp()}.xlsx`, await wb.xlsx.writeBuffer());
    } catch (e) { console.error(e); toast('Could not build the Excel file', true); }
    btn.disabled = false; btn.textContent = 'Download Excel';
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
    // Tint the sHNI / bHNI / None count columns when the count is above zero.
    const tintCounts = (x, c0) => {
      if (c0 == null || x.section !== 'body' || !(Number(x.cell.raw) > 0)) return;
      const k = x.column.index - c0;
      const f = [[[207, 234, 234], [19, 90, 93]], [[211, 226, 245], [18, 63, 117]], [[240, 236, 228], [120, 124, 130]]][k];
      if (f) { x.cell.styles.fillColor = f[0]; x.cell.styles.textColor = f[1]; x.cell.styles.fontStyle = 'bold'; }
    };
    const table = (opts, rightFrom) => doc.autoTable({ margin: { left: 32, right: 32, top: 40 }, headStyles: head, footStyles: foot, styles: { fontSize: 8, cellPadding: 3.5 }, showFoot: 'lastPage',
      didParseCell: (x) => { if (rightFrom != null && x.column.index >= rightFrom && x.column.index < (opts.rightTo ?? 99)) x.cell.styles.halign = 'right'; tintCounts(x, opts.tint); }, ...opts });
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
    const chip = (x, rgb, txt, tc) => { doc.setFillColor(...rgb); doc.roundedRect(x, 88, 46, 13, 2, 2, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...tc); doc.text(txt, x + 23, 97, { align: 'center' }); };
    chip(32, [44, 143, 147], 'S = sHNI', [255, 255, 255]); chip(84, [29, 95, 168], 'B = bHNI', [255, 255, 255]); chip(136, [240, 236, 228], '- = None', [120, 124, 130]);
    doc.lastAutoTable = { finalY: 98 };
    let y = heading('IPO-wise summary');
    table({ startY: y, head: [['IPO', 'Open', 'Close', 'Status', 'Upper price', 'Lot', 'Applied', 'sHNI', 'bHNI', 'None', 'Lots', 'Shares', 'Amount blocked']],
      body: d.byIpo.map((b) => [b.ipo.name, fdx(b.ipo.openDate), fdx(b.ipo.closeDate), b.ipo.status, n(b.ipo.priceHigh), n(b.ipo.lotSize), `${b.t.applied}/${b.t.cells}`, b.t.shni, b.t.bhni, b.t.none, n(b.t.lots), n(b.t.shares), n(b.t.amount)]),
      foot: [['TOTAL', '', '', '', '', '', `${g.applied}/${g.cells}`, g.shni, g.bhni, g.none, n(g.lots), n(g.shares), n(g.amount)]],
      tint: 7 }, 4);
    y = heading('Account-wise summary');
    table({ startY: y, head: [['#', 'Account', 'PAN', 'IPOs applied', 'sHNI', 'bHNI', 'None', 'Hit rate', 'Amount blocked', 'Last applied in']],
      body: d.byAcc.map((b, i) => [i + 1, b.acc.name, b.acc.pan || '', `${b.t.applied}/${b.t.cells}`, b.t.shni, b.t.bhni, b.t.none, pct(b.t.applied, b.t.cells), n(b.t.amount), b.last?.name || '-']),
      foot: [['', 'TOTAL', '', `${g.applied}/${g.cells}`, g.shni, g.bhni, g.none, pct(g.applied, g.cells), n(g.amount), '']],
      rightTo: 9, tint: 4 }, 3);
    // Matrix in chunks of 10 IPOs so it fits the page width.
    const cellOf = (ipo, acc) => d.shown.find((c) => c.ipo === ipo && c.acc === acc);
    for (let k = 0; k < d.ipos.length; k += 10) {
      const part = d.ipos.slice(k, k + 10);
      y = heading(`Matrix${d.ipos.length > 10 ? ` (IPOs ${k + 1}-${k + part.length})` : ''}`, 'S = sHNI   B = bHNI   - = None');
      table({ startY: y, head: [['Account', ...part.map((i) => (i.symbol || i.name).slice(0, 12))]],
        body: d.byAcc.map((b) => [b.acc.name, ...part.map((i) => { const c = cellOf(i, b.acc); return !c ? '' : c.cat === 'SHNI' ? 'S' : c.cat === 'BHNI' ? 'B' : '-'; })]),
        foot: [['sHNI / bHNI / None', ...part.map((i) => { const b = d.byIpo.find((x) => x.ipo.id === i.id); return `${b.t.shni}/${b.t.bhni}/${b.t.none}`; })]],
        didParseCell: (x) => { if (x.column.index > 0) x.cell.styles.halign = 'center'; if (x.section !== 'body') return; if (x.cell.raw === 'S') { x.cell.styles.fillColor = [44, 143, 147]; x.cell.styles.textColor = 255; x.cell.styles.fontStyle = 'bold'; } if (x.cell.raw === 'B') { x.cell.styles.fillColor = [29, 95, 168]; x.cell.styles.textColor = 255; x.cell.styles.fontStyle = 'bold'; } if (x.cell.raw === '-') { x.cell.styles.fillColor = [240, 236, 228]; x.cell.styles.textColor = [140, 144, 150]; } } });
    }
    for (const b of d.byIpo) {
      const ap = b.list.filter((c) => c.cat !== 'NONE'), no = b.list.filter((c) => c.cat === 'NONE');
      y = heading(`${b.ipo.name}${b.ipo.symbol ? ' (' + b.ipo.symbol + ')' : ''}`, `${fdx(b.ipo.openDate)} to ${fdx(b.ipo.closeDate)}  |  Price band Rs ${n(b.ipo.priceLow || b.ipo.priceHigh)} - ${n(b.ipo.priceHigh)}  |  Lot ${n(b.ipo.lotSize)}  |  sHNI ${b.t.shni}  bHNI ${b.t.bhni}  None ${b.t.none}`);
      table({ startY: y, head: [['#', 'Account', 'PAN', 'Category', 'Application no.', 'Lots', 'Shares', 'Upper price', 'Amount blocked', 'Remarks']],
        body: ap.length ? ap.map((c, i) => [i + 1, c.acc.name, c.acc.pan || '', CATN[c.cat], c.appNo || '-', n(c.lots), n(c.shares), n(c.ipo.priceHigh), n(c.amount), c.remarks]) : [['', 'No applications', '', '', '', '', '', '', '', '']],
        foot: [['', `Applied ${b.t.applied} accounts`, '', `${b.t.shni} S / ${b.t.bhni} B`, `${b.list.filter((c) => c.cat !== 'NONE' && c.appNo).length} nos.`, n(b.t.lots), n(b.t.shares), '', n(b.t.amount), '']],
        didParseCell: (x) => { if ([0, 5, 6, 7, 8].includes(x.column.index)) x.cell.styles.halign = 'right'; if (x.section === 'body' && x.column.index === 3) { if (x.cell.raw === 'sHNI') { x.cell.styles.fillColor = [207, 234, 234]; x.cell.styles.textColor = [19, 90, 93]; x.cell.styles.fontStyle = 'bold'; } if (x.cell.raw === 'bHNI') { x.cell.styles.fillColor = [211, 226, 245]; x.cell.styles.textColor = [18, 63, 117]; x.cell.styles.fontStyle = 'bold'; } } } });
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
    save(`FinDeependence-IPO-Report-${fileStamp()}.pdf`, doc.output('arraybuffer'));
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
  let ipoTabSort = store.get('ipoTabSort') || 'open-desc';
  $('#ipoTable').addEventListener('click', (e) => {
    const h = e.target.closest('th[data-tsort]'); if (!h) return;
    const [k, dir] = ipoTabSort.split('-');
    ipoTabSort = `${h.dataset.tsort}-${k === h.dataset.tsort ? (dir === 'asc' ? 'desc' : 'asc') : h.dataset.def}`;
    store.set('ipoTabSort', ipoTabSort); renderIpos();
  });
  function renderIpos() {
    const ls = S.feed?.updatedAt || S.ipos.map((i) => i.syncedAt).filter(Boolean).sort().pop();
    $('#ipoInfo').textContent = `New mainboard IPOs arrive from NSE automatically every hour, with dates, price band and lot size${ls ? ` (last NSE update ${new Date(ls).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST)` : ''}. You only need to add an IPO here if it is missing.`;
    const list = sortBy(sortedIpos(), ipoTabSort, (i, k) => ({ name: i.name, symbol: i.symbol, type: i.type || 'Mainboard', open: i.openDate, close: i.closeDate, status: status(i), price: i.priceHigh }[k]));
    const [tk, td] = ipoTabSort.split('-');
    const th = (label, key, cls = '', def = 'asc') => `<th class="${cls} sortable${tk === key ? ' on' : ''}" data-tsort="${key}" data-def="${def}">${label}<span class="arr">${tk === key ? (td === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
    $('#ipoTable').innerHTML = `<thead><tr>${th('Company', 'name')}${th('Symbol', 'symbol')}${th('Type', 'type')}${th('Open', 'open', '', 'desc')}${th('Close', 'close', '', 'desc')}${th('Status', 'status')}${th('Price band', 'price', 'num', 'desc')}<th class="num">Lot</th><th class="num">sHNI min</th><th class="num">bHNI min</th><th>Source</th><th></th></tr></thead><tbody>` +
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
