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
  function buildReport(f) {
    const accs = new Map(S.accounts.map((a) => [a.id, a]));
    let ipos = sortedIpos();
    if (f.ipo) ipos = ipos.filter((i) => i.id === f.ipo);
    if (f.from) ipos = ipos.filter((i) => (i.closeDate || i.openDate || '9999') >= f.from);
    if (f.to) ipos = ipos.filter((i) => (i.openDate || '0000') <= f.to);
    const blocks = [], g = { accounts: 0, shni: 0, bhni: 0, lots: 0, shares: 0, amount: 0 };
    for (const ipo of ipos) {
      const rows = [];
      for (const app of S.apps.values()) {
        if (app.ipoId !== ipo.id || !app.category || (f.cat && app.category !== f.cat)) continue;
        const acc = accs.get(app.accountId); if (!acc) continue;
        const c = calc(ipo, app);
        rows.push({ order: acc.order || 0, account: acc.name, pan: acc.pan || '', category: CAT[app.category], lots: c.lots, shares: c.shares, price: ipo.priceHigh ?? null, amount: c.amount, remarks: app.remarks || '' });
      }
      if (!rows.length) continue;
      rows.sort((a, b) => a.order - b.order);
      const t = { accounts: rows.length, shni: 0, bhni: 0, lots: 0, shares: 0, amount: 0 };
      for (const r of rows) { r.category === 'sHNI' ? t.shni++ : t.bhni++; t.lots += r.lots || 0; t.shares += r.shares || 0; t.amount += r.amount || 0; }
      for (const k in g) g[k] += t[k];
      blocks.push({ ipo: { ...ipo, status: status(ipo), lotAmount: lotAmt(ipo) }, rows, totals: t });
    }
    return { blocks, grand: g, filters: f };
  }
  const filters = () => ({ from: $('#rFrom').value, to: $('#rTo').value, ipo: $('#rIpo').value, cat: $('#rCat').value });
  ['rFrom', 'rTo', 'rIpo', 'rCat'].forEach((id) => $('#' + id).addEventListener('change', renderReport));
  $$('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const t = istToday();
    if (b.dataset.range === 'month') { $('#rFrom').value = t.slice(0, 8) + '01'; $('#rTo').value = t; }
    if (b.dataset.range === 'last30') { $('#rFrom').value = addDays(t, -30); $('#rTo').value = t; }
    if (b.dataset.range === 'clear') { $('#rFrom').value = ''; $('#rTo').value = ''; $('#rIpo').value = ''; $('#rCat').value = ''; }
    renderReport();
  }));
  function renderReport() {
    const cur = $('#rIpo').value;
    $('#rIpo').innerHTML = '<option value="">All IPOs</option>' + sortedIpos().map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
    $('#rIpo').value = S.ipos.some((i) => i.id === cur) ? cur : '';
    const r = buildReport(filters()), g = r.grand;
    $('#reportOut').innerHTML = `
      <div class="tiles">
        <div class="fact"><small>IPOs</small><b>${r.blocks.length}</b></div>
        <div class="fact"><small>Applications</small><b>${g.accounts}</b><span class="hint">${g.shni} sHNI · ${g.bhni} bHNI</span></div>
        <div class="fact"><small>Total lots</small><b>${inr(g.lots)}</b></div>
        <div class="fact"><small>Total shares</small><b>${inr(g.shares)}</b></div>
        <div class="fact"><small>Amount blocked</small><b>${rs(g.amount)}</b><span class="hint">at upper price band</span></div>
      </div>
      <h3 class="sec">IPO-wise summary</h3>
      <div class="tbl"><table>
        <thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Status</th><th class="num">Upper price</th><th class="num">Lot</th><th class="num">sHNI</th><th class="num">bHNI</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount blocked</th></tr></thead>
        <tbody>${r.blocks.map((b) => `<tr><td>${esc(b.ipo.name)}</td><td>${fd(b.ipo.openDate)}</td><td>${fd(b.ipo.closeDate)}</td><td><span class="pill ${b.ipo.status}">${b.ipo.status}</span></td><td class="num">${rs(b.ipo.priceHigh)}</td><td class="num">${inr(b.ipo.lotSize)}</td><td class="num">${b.totals.shni}</td><td class="num">${b.totals.bhni}</td><td class="num">${inr(b.totals.lots)}</td><td class="num">${inr(b.totals.shares)}</td><td class="num">${rs(b.totals.amount)}</td></tr>`).join('') || `<tr><td colspan="11" class="muted">${S.loaded.apps ? 'No applications match these filters. Mark categories on the Apply tab first.' : 'Loading…'}</td></tr>`}</tbody>
        ${r.blocks.length ? `<tfoot><tr class="tot"><td>Grand total</td><td></td><td></td><td></td><td></td><td></td><td class="num">${g.shni}</td><td class="num">${g.bhni}</td><td class="num">${inr(g.lots)}</td><td class="num">${inr(g.shares)}</td><td class="num">${rs(g.amount)}</td></tr></tfoot>` : ''}
      </table></div>
      ${r.blocks.length ? '<h3 class="sec">Account-wise detail</h3>' : ''}
      ${r.blocks.map((b) => `<details class="blk"><summary><span>${esc(b.ipo.name)}</span><span class="muted">${b.totals.accounts} accounts · <span class="num">${rs(b.totals.amount)}</span></span></summary>
        <div class="tbl"><table><thead><tr><th>Account</th><th>PAN</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Upper price</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
        <tbody>${b.rows.map((x) => `<tr><td>${esc(x.account)}</td><td style="font-family:var(--mono)">${esc(x.pan)}</td><td><span class="pill ${x.category.toUpperCase()}">${x.category}</span></td><td class="num">${inr(x.lots)}</td><td class="num">${inr(x.shares)}</td><td class="num">${rs(x.price)}</td><td class="num">${rs(x.amount)}</td><td>${esc(x.remarks)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
  }

  function save(filename, data) {
    const type = filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileStamp = () => istToday();
  $('#dlXlsx').addEventListener('click', () => {
    if (!window.XLSX) return toast('Excel library did not load. Reload the page.', true);
    const r = buildReport(filters()), g = r.grand;
    const sum = [['IPO', 'Symbol', 'Open', 'Close', 'Status', 'Price band low', 'Upper price', 'Lot size', 'sHNI accounts', 'bHNI accounts', 'Total lots', 'Total shares', 'Amount blocked (Rs)']];
    for (const b of r.blocks) sum.push([b.ipo.name, b.ipo.symbol || '', fdx(b.ipo.openDate), fdx(b.ipo.closeDate), b.ipo.status, b.ipo.priceLow ?? '', b.ipo.priceHigh ?? '', b.ipo.lotSize ?? '', b.totals.shni, b.totals.bhni, b.totals.lots, b.totals.shares, b.totals.amount]);
    sum.push(['GRAND TOTAL', '', '', '', '', '', '', '', g.shni, g.bhni, g.lots, g.shares, g.amount]);
    const det = [['IPO', 'Open', 'Close', 'Account', 'PAN', 'Category', 'Lots', 'Shares', 'Upper price', 'Amount blocked (Rs)', 'Remarks']];
    for (const b of r.blocks) {
      for (const x of b.rows) det.push([b.ipo.name, fdx(b.ipo.openDate), fdx(b.ipo.closeDate), x.account, x.pan, x.category, x.lots, x.shares, x.price, x.amount, x.remarks]);
      det.push([`${b.ipo.name} – Total`, '', '', `${b.totals.accounts} accounts`, '', `${b.totals.shni} sHNI / ${b.totals.bhni} bHNI`, b.totals.lots, b.totals.shares, '', b.totals.amount, '']);
    }
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.aoa_to_sheet(sum); s1['!cols'] = [40, 12, 13, 13, 10, 12, 11, 9, 12, 12, 11, 13, 20].map((w) => ({ wch: w }));
    const s2 = XLSX.utils.aoa_to_sheet(det); s2['!cols'] = [36, 13, 13, 26, 13, 18, 8, 10, 11, 20, 24].map((w) => ({ wch: w }));
    for (const [sh, col] of [[s1, 12], [s2, 9]]) { const rg = XLSX.utils.decode_range(sh['!ref']); for (let R = 1; R <= rg.e.r; R++) { const c = sh[XLSX.utils.encode_cell({ r: R, c: col })]; if (c && typeof c.v === 'number') c.z = '#,##,##0'; } }
    XLSX.utils.book_append_sheet(wb, s1, 'IPO Summary');
    XLSX.utils.book_append_sheet(wb, s2, 'Account Detail');
    save(`IPO-Report-${fileStamp()}.xlsx`, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  });
  $('#dlPdf').addEventListener('click', () => {
    const J = window.jspdf?.jsPDF;
    if (!J) return toast('PDF library did not load. Reload the page.', true);
    const r = buildReport(filters()), g = r.grand, f = r.filters;
    const n = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
    const doc = new J({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const head = { fillColor: [14, 39, 64], textColor: 255, fontStyle: 'bold' };
    doc.setFillColor(14, 39, 64); doc.rect(0, 0, W, 30, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(127, 211, 214); doc.text('FINDEEPENDENCE', 32, 19); doc.setTextColor(255); doc.setFont('helvetica', 'normal'); doc.text('CA Deep Dalal  |  Chartered Accountant  |  Fund Manager', W - 32, 19, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(14, 39, 64);
    doc.text('IPO Application Report - sHNI / bHNI', 32, 50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    const scope = [f.from && 'From ' + fdx(f.from), f.to && 'To ' + fdx(f.to), f.cat && 'Category: ' + CAT[f.cat], f.ipo && 'IPO: ' + (S.ipos.find((i) => i.id === f.ipo)?.name || '')].filter(Boolean).join('   ');
    doc.text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST${scope ? '   |   ' + scope : ''}   |   Amounts in Rs at upper price band`, 32, 64);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(`IPOs: ${r.blocks.length}    Applications: ${g.accounts} (sHNI ${g.shni} / bHNI ${g.bhni})    Lots: ${n(g.lots)}    Shares: ${n(g.shares)}    Total blocked: Rs ${n(g.amount)}`, 32, 82);
    const R = { halign: 'right' };
    doc.autoTable({
      startY: 94, margin: { left: 32, right: 32 }, headStyles: head, styles: { fontSize: 8.5, cellPadding: 4 },
      head: [['IPO', 'Open', 'Close', 'Status', 'Upper price', 'Lot', 'sHNI', 'bHNI', 'Lots', 'Shares', 'Amount blocked']],
      body: r.blocks.map((b) => [b.ipo.name, fdx(b.ipo.openDate), fdx(b.ipo.closeDate), b.ipo.status, n(b.ipo.priceHigh), n(b.ipo.lotSize), b.totals.shni, b.totals.bhni, n(b.totals.lots), n(b.totals.shares), n(b.totals.amount)]),
      foot: [['GRAND TOTAL', '', '', '', '', '', g.shni, g.bhni, n(g.lots), n(g.shares), n(g.amount)]],
      footStyles: { fillColor: [234, 227, 210], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 4: R, 5: R, 6: R, 7: R, 8: R, 9: R, 10: R }, showFoot: 'lastPage',
      didParseCell: (d) => { if (d.column.index >= 4) d.cell.styles.halign = 'right'; },
    });
    for (const b of r.blocks) {
      let y = doc.lastAutoTable.finalY + 24;
      if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(14, 39, 64);
      doc.text(`${b.ipo.name}${b.ipo.symbol ? ' (' + b.ipo.symbol + ')' : ''}`, 32, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
      doc.text(`${fdx(b.ipo.openDate)} to ${fdx(b.ipo.closeDate)}  |  Price band Rs ${n(b.ipo.priceLow || b.ipo.priceHigh)} - ${n(b.ipo.priceHigh)}  |  Lot ${n(b.ipo.lotSize)} shares  |  1 lot = Rs ${n(b.ipo.lotAmount)}`, 32, y + 13);
      doc.autoTable({
        startY: y + 20, margin: { left: 32, right: 32 }, headStyles: head, styles: { fontSize: 8.5, cellPadding: 4 },
        head: [['#', 'Account', 'PAN', 'Category', 'Lots', 'Shares', 'Upper price', 'Amount blocked', 'Remarks']],
        body: b.rows.map((x, i) => [i + 1, x.account, x.pan, x.category, n(x.lots), n(x.shares), n(x.price), n(x.amount), x.remarks]),
        foot: [['', `Total (${b.totals.accounts} accounts)`, '', `${b.totals.shni} sHNI / ${b.totals.bhni} bHNI`, n(b.totals.lots), n(b.totals.shares), '', n(b.totals.amount), '']],
        footStyles: { fillColor: [234, 227, 210], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: R, 4: R, 5: R, 6: R, 7: R }, showFoot: 'lastPage',
        didParseCell: (d) => { if ([0, 4, 5, 6, 7].includes(d.column.index)) d.cell.styles.halign = 'right'; },
      });
    }
    if (!r.blocks.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('No applications found for the selected filters.', 32, doc.lastAutoTable.finalY + 24); }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text('FinDeependence', 32, doc.internal.pageSize.getHeight() - 16); doc.text(`Page ${i} of ${pages}`, W - 32, doc.internal.pageSize.getHeight() - 16, { align: 'right' }); }
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
    $('#ipoInfo').textContent = `Mainboard IPOs from NSE, updated automatically every 3 hours${ls ? ` (last NSE update ${new Date(ls).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST)` : ''}. Add or correct any IPO here.`;
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
  let local = { accounts: {}, apps: {}, ipos: {} };
  let remote = {};
  let lsOk = true;
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(local)); }
    catch { lsOk = false; showStatus('This browser is not letting the app save data (private window or blocked storage). Changes will be lost when you close the tab.'); }
  }
  function refresh() {
    S.accounts = Object.entries(local.accounts).map(([id, v]) => ({ id, ...v }));
    S.apps = new Map(Object.entries(local.apps));
    const ipos = { ...remote };
    for (const [id, v] of Object.entries(local.ipos)) { if (v.__deleted) delete ipos[id]; else ipos[id] = { id, ...v }; }
    S.ipos = Object.values(ipos);
    schedule();
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
    if (raw) { const v = JSON.parse(raw); local = { accounts: v.accounts || {}, apps: v.apps || {}, ipos: v.ipos || {} }; }
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
  $('#backupBtn').addEventListener('click', () => {
    save(`FinDeependence-IPO-backup-${istToday()}.json`, new Blob([JSON.stringify({ app: 'findeependence-ipo-ledger', version: 1, savedAt: new Date().toISOString(), ...local }, null, 2)], { type: 'application/json' }));
  });
  $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreBtn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#restoreFile').click(); } });
  $('#restoreFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const v = JSON.parse(await f.text());
      if (v.app !== 'findeependence-ipo-ledger' || !v.accounts) throw new Error('bad');
      local = { accounts: v.accounts || {}, apps: v.apps || {}, ipos: v.ipos || {} };
      persist(); refresh(); toast('Backup restored');
    } catch { toast('That file is not a FinDeependence IPO backup', true); }
  });
})();
