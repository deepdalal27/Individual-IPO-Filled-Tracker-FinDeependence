const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const inr = (n) => (n == null || n === '' ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
const rs = (n) => (n == null ? '-' : '₹' + inr(n));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fd = (d) => { if (!d) return '-'; const [y, m, x] = d.split('-'); return `${x} ${MON[m - 1]} ${y}`; };
const CAT = { SHNI: 'sHNI', BHNI: 'bHNI' };

let S = { accounts: [], ipos: [], meta: {} };
let selIpo = localStorage.getItem('selIpo') || null;

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 2200);
}
async function refresh() { S = await api('/api/state'); }

// ---------- Tabs ----------
$$('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  localStorage.setItem('tab', name);
  ({ apply: renderApply, report: renderReport, ipos: renderIpos, accounts: renderAccounts })[name]();
}

// ---------- Apply ----------
$('#ipoFilter').addEventListener('change', renderIpoList);
function renderIpoList() {
  const f = $('#ipoFilter').value;
  const list = S.ipos.filter((i) => f === 'all' || i.status !== 'Closed' || (i.closeDate || '') >= addDays(S.today, -7));
  $('#ipoList').innerHTML = list.length ? list.map((i) => `
    <button class="ipo-item ${i.id === selIpo ? 'sel' : ''}" data-id="${i.id}">
      <div class="nm">${esc(i.name)} <span class="badge ${i.status}">${i.status}</span></div>
      <div class="sub">${fd(i.openDate)} – ${fd(i.closeDate)} · ${i.priceHigh ? '₹' + inr(i.priceHigh) : 'Price TBA'} · Lot ${i.lotSize || '-'}</div>
      <div class="sub">${i.appliedCount ? `${i.appliedCount} account(s) applied` : 'No applications yet'}</div>
    </button>`).join('') : '<p class="muted">No IPOs. Sync from NSE or add one in the IPOs tab.</p>';
  $$('#ipoList .ipo-item').forEach((b) => b.addEventListener('click', () => { selIpo = b.dataset.id; localStorage.setItem('selIpo', selIpo); renderIpoList(); renderApplyPanel(); }));
}
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

async function renderApply() {
  await refresh();
  if (selIpo && !S.ipos.some((i) => i.id === selIpo)) selIpo = null;
  if (!selIpo) selIpo = (S.ipos.find((i) => i.status === 'Open') || S.ipos.find((i) => i.status === 'Upcoming') || S.ipos[0] || {}).id || null;
  renderIpoList();
  renderApplyPanel();
}

async function renderApplyPanel() {
  const p = $('#applyPanel');
  if (!selIpo) { p.innerHTML = '<p class="muted">Select an IPO on the left.</p>'; return; }
  const { ipo, rows } = await api(`/api/ipos/${selIpo}/applications`);
  const r = ipo.ranges;
  const ready = ipo.priceHigh && ipo.lotSize;
  p.innerHTML = `
    <div class="ipo-head">
      <div>
        <h3>${esc(ipo.name)} <span class="badge ${ipo.status}">${ipo.status}</span></h3>
        <p class="muted">${esc(ipo.symbol || '')} · ${esc(ipo.type || '')} · ${fd(ipo.openDate)} to ${fd(ipo.closeDate)}</p>
      </div>
      <div class="btns"><button class="ghost" id="clearAll">Clear all</button></div>
    </div>
    <div class="facts">
      <div class="fact"><small>Price band</small><b>₹${inr(ipo.priceLow)} – ₹${inr(ipo.priceHigh)}</b></div>
      <div class="fact"><small>Lot size</small><b>${inr(ipo.lotSize)} shares</b></div>
      <div class="fact"><small>1 lot @ upper</small><b>${rs(ipo.lotAmount)}</b></div>
      <div class="fact shni"><small>sHNI min</small><b>${r.SHNI ? `${r.SHNI.min} lots · ${rs(r.SHNI.min * ipo.lotAmount)}` : '-'}</b>${r.SHNI ? `<small>max ${r.SHNI.max} lots</small>` : ''}</div>
      <div class="fact bhni"><small>bHNI min</small><b>${r.BHNI ? `${r.BHNI.min} lots · ${rs(r.BHNI.min * ipo.lotAmount)}` : '-'}</b></div>
    </div>
    ${ready ? '' : '<p class="muted" style="color:#b26a00">Price band / lot size not announced yet – you can still mark the category; amounts fill in automatically once NSE publishes them.</p>'}
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Account</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount blocked</th><th>Remarks</th></tr></thead>
      <tbody>${rows.filter((x) => x.account.active !== false || x.application?.category).map((x, i) => rowHtml(ipo, x, i)).join('')}</tbody>
      <tfoot id="applyTotals"></tfoot>
    </table></div>`;
  updateTotals(ipo, rows);

  $$('.seg button', p).forEach((b) => b.addEventListener('click', () => save(ipo, rows, b.closest('tr').dataset.acc, { category: b.dataset.cat || null })));
  $$('input.lots', p).forEach((inp) => inp.addEventListener('change', () => save(ipo, rows, inp.closest('tr').dataset.acc, { lots: inp.value })));
  $$('input.remarks', p).forEach((inp) => inp.addEventListener('change', () => save(ipo, rows, inp.closest('tr').dataset.acc, { remarks: inp.value })));
  $('#clearAll').addEventListener('click', async () => {
    if (!confirm('Remove category for all accounts in this IPO?')) return;
    for (const x of rows) if (x.application?.category) await api('/api/applications', { method: 'PUT', body: { ipoId: ipo.id, accountId: x.account.id, category: null } });
    toast('Cleared'); renderApply();
  });
}

function rowHtml(ipo, x, i) {
  const cat = x.application?.category || '';
  const c = x.calc;
  const rg = cat ? ipo.ranges[cat] : null;
  return `<tr data-acc="${x.account.id}" class="${cat ? 'applied-' + cat : ''}">
    <td>${i + 1}</td>
    <td>${esc(x.account.name)}${x.account.pan ? `<div class="muted" style="font-size:11px">${esc(x.account.pan)}</div>` : ''}</td>
    <td><div class="seg">
      <button data-cat="" class="${!cat ? 'on' : ''}">None</button>
      <button data-cat="SHNI" class="${cat === 'SHNI' ? 'on' : ''}">sHNI</button>
      <button data-cat="BHNI" class="${cat === 'BHNI' ? 'on' : ''}">bHNI</button>
    </div></td>
    <td class="num">${cat ? `<input class="lots" type="number" min="${rg?.min ?? 1}" ${rg?.max ? `max="${rg.max}"` : ''} value="${c?.lots ?? ''}" ${rg ? '' : 'disabled'} title="Defaults to the minimum for the category">` : '-'}</td>
    <td class="num">${cat ? inr(c?.shares) : '-'}</td>
    <td class="num">${cat ? rs(c?.amount) : '-'}</td>
    <td>${cat ? `<input class="remarks" value="${esc(x.application?.remarks || '')}" placeholder="optional">` : ''}</td>
  </tr>`;
}

function updateTotals(ipo, rows) {
  const t = { s: 0, b: 0, lots: 0, shares: 0, amt: 0 };
  for (const x of rows) {
    if (!x.application?.category) continue;
    x.application.category === 'SHNI' ? t.s++ : t.b++;
    t.lots += x.calc?.lots || 0; t.shares += x.calc?.shares || 0; t.amt += x.calc?.amount || 0;
  }
  $('#applyTotals').innerHTML = `<tr class="total"><td></td><td>Total (${t.s + t.b} accounts)</td><td>${t.s} sHNI · ${t.b} bHNI</td><td class="num">${inr(t.lots)}</td><td class="num">${inr(t.shares)}</td><td class="num">${rs(t.amt)}</td><td></td></tr>`;
}

async function save(ipo, rows, accountId, patch) {
  const x = rows.find((r) => r.account.id === accountId);
  const body = { ipoId: ipo.id, accountId, category: x.application?.category || null, ...patch };
  try {
    const res = await api('/api/applications', { method: 'PUT', body });
    x.application = res.application; x.calc = res.calc;
    const tr = $(`tr[data-acc="${accountId}"]`);
    const idx = [...tr.parentNode.children].indexOf(tr);
    tr.outerHTML = rowHtml(ipo, x, idx);
    const ntr = $(`tr[data-acc="${accountId}"]`);
    $$('.seg button', ntr).forEach((b) => b.addEventListener('click', () => save(ipo, rows, accountId, { category: b.dataset.cat || null })));
    $('input.lots', ntr)?.addEventListener('change', (e) => save(ipo, rows, accountId, { lots: e.target.value }));
    $('input.remarks', ntr)?.addEventListener('change', (e) => save(ipo, rows, accountId, { remarks: e.target.value }));
    updateTotals(ipo, rows);
    toast('Saved');
  } catch (e) { toast(e.message, true); renderApplyPanel(); }
}

// ---------- Report ----------
['rFrom', 'rTo', 'rIpo', 'rCat'].forEach((id) => $('#' + id).addEventListener('change', loadReport));
$$('.quick button').forEach((b) => b.addEventListener('click', () => {
  const t = S.today;
  if (b.dataset.range === 'month') { $('#rFrom').value = t.slice(0, 8) + '01'; $('#rTo').value = t; }
  if (b.dataset.range === 'last30') { $('#rFrom').value = addDays(t, -30); $('#rTo').value = t; }
  if (b.dataset.range === 'clear') { $('#rFrom').value = ''; $('#rTo').value = ''; $('#rIpo').value = ''; $('#rCat').value = ''; }
  loadReport();
}));
const qs = () => new URLSearchParams(Object.entries({ from: $('#rFrom').value, to: $('#rTo').value, ipo: $('#rIpo').value, category: $('#rCat').value }).filter(([, v]) => v)).toString();
$('#dlXlsx').addEventListener('click', () => (location.href = '/api/report.xlsx?' + qs()));
$('#dlPdf').addEventListener('click', () => (location.href = '/api/report.pdf?' + qs()));

async function renderReport() {
  await refresh();
  const cur = $('#rIpo').value;
  $('#rIpo').innerHTML = '<option value="">All IPOs</option>' + S.ipos.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
  $('#rIpo').value = cur;
  loadReport();
}
async function loadReport() {
  const r = await api('/api/report?' + qs());
  const g = r.grand;
  $('#reportOut').innerHTML = `
    <div class="summary-cards">
      <div class="fact"><small>IPOs</small><b>${r.blocks.length}</b></div>
      <div class="fact"><small>Applications</small><b>${g.accounts}</b><small>${g.shni} sHNI · ${g.bhni} bHNI</small></div>
      <div class="fact"><small>Total lots</small><b>${inr(g.lots)}</b></div>
      <div class="fact"><small>Total shares</small><b>${inr(g.shares)}</b></div>
      <div class="fact"><small>Total amount blocked</small><b>${rs(g.amount)}</b></div>
    </div>
    <h3>IPO-wise summary</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>IPO</th><th>Open</th><th>Close</th><th>Status</th><th class="num">Upper price</th><th class="num">Lot</th><th class="num">sHNI</th><th class="num">bHNI</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Amount blocked</th></tr></thead>
      <tbody>${r.blocks.map((b) => `<tr><td>${esc(b.ipo.name)}</td><td>${fd(b.ipo.openDate)}</td><td>${fd(b.ipo.closeDate)}</td><td><span class="badge ${b.ipo.status}">${b.ipo.status}</span></td><td class="num">${rs(b.ipo.priceHigh)}</td><td class="num">${inr(b.ipo.lotSize)}</td><td class="num">${b.totals.shni}</td><td class="num">${b.totals.bhni}</td><td class="num">${inr(b.totals.lots)}</td><td class="num">${inr(b.totals.shares)}</td><td class="num">${rs(b.totals.amount)}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">No applications for these filters.</td></tr>'}</tbody>
      <tfoot><tr class="total"><td>Grand total</td><td></td><td></td><td></td><td></td><td></td><td class="num">${g.shni}</td><td class="num">${g.bhni}</td><td class="num">${inr(g.lots)}</td><td class="num">${inr(g.shares)}</td><td class="num">${rs(g.amount)}</td></tr></tfoot>
    </table></div>
    ${r.blocks.map((b) => `<details class="ipo-detail"><summary>${esc(b.ipo.name)} — ${b.totals.accounts} accounts · ${rs(b.totals.amount)}</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Account</th><th>PAN</th><th>Category</th><th class="num">Lots</th><th class="num">Shares</th><th class="num">Upper price</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
        <tbody>${b.rows.map((x) => `<tr><td>${esc(x.account)}</td><td>${esc(x.pan)}</td><td><span class="badge ${x.category.toUpperCase()}">${x.category}</span></td><td class="num">${inr(x.lots)}</td><td class="num">${inr(x.shares)}</td><td class="num">${rs(x.price)}</td><td class="num">${rs(x.amount)}</td><td>${esc(x.remarks)}</td></tr>`).join('')}</tbody>
      </table></div></details>`).join('')}`;
}

// ---------- IPOs ----------
const form = $('#ipoForm');
$('#addIpoBtn').addEventListener('click', () => { form.reset(); form.id.value = ''; form.classList.remove('hidden'); form.name.focus(); });
$('#ipoCancel').addEventListener('click', () => form.classList.add('hidden'));
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  const id = body.id; delete body.id;
  try {
    await api(id ? `/api/ipos/${id}` : '/api/ipos', { method: id ? 'PUT' : 'POST', body });
    form.classList.add('hidden'); toast('IPO saved'); renderIpos();
  } catch (err) { toast(err.message, true); }
});
$('#syncBtn').addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = 'Syncing…';
  try { const r = await api('/api/sync', { method: 'POST' }); toast(`NSE: ${r.found} IPOs (${r.added} new)`); }
  catch (err) { toast(err.message, true); }
  e.target.disabled = false; e.target.textContent = 'Sync from NSE now';
  renderIpos();
});

async function renderIpos() {
  await refresh();
  const ls = S.meta.lastSync;
  $('#syncInfo').textContent = ls ? `Auto-synced from NSE every few hours. Last sync: ${new Date(ls.at).toLocaleString('en-IN')}${ls.failed ? ' (failed – ' + ls.errors.join('; ') + ')' : ` · ${ls.found} active IPOs found`}` : 'Not synced yet.';
  $('#ipoTable').innerHTML = `<thead><tr><th>Company</th><th>Symbol</th><th>Type</th><th>Open</th><th>Close</th><th>Status</th><th class="num">Price band</th><th class="num">Lot</th><th class="num">sHNI min</th><th class="num">bHNI min</th><th>Source</th><th></th></tr></thead><tbody>` +
    S.ipos.map((i) => `<tr>
      <td>${esc(i.name)}</td><td>${esc(i.symbol || '')}</td><td>${esc(i.type || '')}</td><td>${fd(i.openDate)}</td><td>${fd(i.closeDate)}</td>
      <td><span class="badge ${i.status}">${i.status}</span></td>
      <td class="num">${i.priceHigh ? `₹${inr(i.priceLow)} – ₹${inr(i.priceHigh)}` : 'TBA'}</td><td class="num">${inr(i.lotSize)}</td>
      <td class="num">${i.ranges.SHNI ? `${i.ranges.SHNI.min} lots<br><small>${rs(i.ranges.SHNI.min * i.lotAmount)}</small>` : '-'}</td>
      <td class="num">${i.ranges.BHNI ? `${i.ranges.BHNI.min} lots<br><small>${rs(i.ranges.BHNI.min * i.lotAmount)}</small>` : '-'}</td>
      <td>${esc(i.source)}${i.locked && i.source === 'NSE' ? ' (edited)' : ''}</td>
      <td><button class="ghost" data-edit="${i.id}">Edit</button> <button class="ghost danger" data-del="${i.id}">Delete</button></td>
    </tr>`).join('') + '</tbody>';
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const i = S.ipos.find((x) => x.id === b.dataset.edit);
    for (const k of ['id', 'name', 'symbol', 'type', 'openDate', 'closeDate', 'priceLow', 'priceHigh', 'lotSize']) form[k].value = i[k] ?? '';
    form.classList.remove('hidden'); form.scrollIntoView({ behavior: 'smooth' });
  }));
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this IPO and all its applications?')) return;
    await api(`/api/ipos/${b.dataset.del}`, { method: 'DELETE' }); toast('Deleted'); renderIpos();
  }));
}

// ---------- Accounts ----------
$('#addAccBtn').addEventListener('click', async () => {
  const name = prompt('Account holder name'); if (!name) return;
  await api('/api/accounts', { method: 'POST', body: { name } }); renderAccounts();
});
async function renderAccounts() {
  await refresh();
  $('#accTable').innerHTML = `<thead><tr><th>#</th><th>Name</th><th>PAN</th><th>Notes (bank / UPI / broker)</th><th>Active</th><th></th></tr></thead><tbody>` +
    S.accounts.map((a, i) => `<tr data-id="${a.id}">
      <td>${i + 1}</td>
      <td><input class="inline" data-f="name" value="${esc(a.name)}"></td>
      <td><input class="inline" data-f="pan" value="${esc(a.pan)}" maxlength="10" style="text-transform:uppercase"></td>
      <td><input class="inline" data-f="notes" value="${esc(a.notes)}"></td>
      <td><input type="checkbox" data-f="active" ${a.active !== false ? 'checked' : ''}></td>
      <td><button class="ghost danger" data-del>Delete</button></td>
    </tr>`).join('') + '</tbody>';
  $$('#accTable [data-f]').forEach((inp) => inp.addEventListener('change', async () => {
    const id = inp.closest('tr').dataset.id;
    try { await api(`/api/accounts/${id}`, { method: 'PUT', body: { [inp.dataset.f]: inp.type === 'checkbox' ? inp.checked : inp.value } }); toast('Saved'); }
    catch (e) { toast(e.message, true); }
  }));
  $$('#accTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this account and its application history?')) return;
    await api(`/api/accounts/${b.closest('tr').dataset.id}`, { method: 'DELETE' }); renderAccounts();
  }));
}

showTab(localStorage.getItem('tab') || 'apply');
