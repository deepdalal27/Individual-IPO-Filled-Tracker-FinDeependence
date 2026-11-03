const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { computeApplication, ipoStatus, lotAmount } = require('./calc');

const CAT_LABEL = { SHNI: 'sHNI', BHNI: 'bHNI' };

// Builds the report data: one block per IPO with every account that applied.
// filters: { from, to, ipoIds: [], category: 'SHNI'|'BHNI'|'' }
function buildReport(state, filters = {}) {
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  let ipos = state.ipos.slice();
  if (filters.ipoIds && filters.ipoIds.length) ipos = ipos.filter((i) => filters.ipoIds.includes(i.id));
  if (filters.from) ipos = ipos.filter((i) => (i.closeDate || i.openDate || '9999') >= filters.from);
  if (filters.to) ipos = ipos.filter((i) => (i.openDate || '0000') <= filters.to);
  ipos.sort((a, b) => (b.openDate || '').localeCompare(a.openDate || ''));

  const blocks = [];
  const grand = { accounts: 0, shni: 0, bhni: 0, lots: 0, shares: 0, amount: 0 };
  for (const ipo of ipos) {
    const rows = [];
    for (const app of state.applications) {
      if (app.ipoId !== ipo.id || !app.category) continue;
      if (filters.category && app.category !== filters.category) continue;
      const acc = accounts.get(app.accountId);
      if (!acc) continue;
      const c = computeApplication(ipo, app);
      rows.push({
        account: acc.name,
        pan: acc.pan || '',
        order: acc.order || 0,
        category: CAT_LABEL[app.category],
        lots: c.lots,
        shares: c.shares,
        price: ipo.priceHigh,
        amount: c.amount,
        remarks: app.remarks || '',
      });
    }
    if (!rows.length && filters.onlyApplied !== false) continue;
    rows.sort((a, b) => a.order - b.order);
    const t = { accounts: rows.length, shni: 0, bhni: 0, lots: 0, shares: 0, amount: 0 };
    for (const r of rows) {
      if (r.category === 'sHNI') t.shni++; else t.bhni++;
      t.lots += r.lots || 0; t.shares += r.shares || 0; t.amount += r.amount || 0;
    }
    for (const k of Object.keys(grand)) grand[k] += t[k];
    blocks.push({ ipo: { ...ipo, status: ipoStatus(ipo), lotAmount: lotAmount(ipo) }, rows, totals: t });
  }
  return { generatedAt: new Date().toISOString(), filters, blocks, grand };
}

const inr = (n) => (n == null ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
const fmtDate = (d) => {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]}-${y}`;
};
const priceBand = (i) => (i.priceHigh ? (i.priceLow && i.priceLow !== i.priceHigh ? `${i.priceLow} - ${i.priceHigh}` : `${i.priceHigh}`) : '-');

async function toExcel(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IPO Filled Tracker';
  wb.created = new Date();
  const money = '#,##,##0';
  const head = (row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2740' } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  };

  // Sheet 1: IPO-wise summary
  const s = wb.addWorksheet('IPO Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  s.columns = [
    { header: 'IPO', key: 'name', width: 40 },
    { header: 'Symbol', key: 'symbol', width: 12 },
    { header: 'Open', key: 'open', width: 13 },
    { header: 'Close', key: 'close', width: 13 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Price Band', key: 'band', width: 13 },
    { header: 'Upper Price', key: 'price', width: 11 },
    { header: 'Lot Size', key: 'lot', width: 9 },
    { header: 'sHNI A/c', key: 'shni', width: 9 },
    { header: 'bHNI A/c', key: 'bhni', width: 9 },
    { header: 'Total Lots', key: 'lots', width: 10 },
    { header: 'Total Shares', key: 'shares', width: 12 },
    { header: 'Amount Blocked (Rs)', key: 'amount', width: 18, style: { numFmt: money } },
  ];
  head(s.getRow(1));
  for (const b of report.blocks) {
    s.addRow({
      name: b.ipo.name, symbol: b.ipo.symbol || '', open: fmtDate(b.ipo.openDate), close: fmtDate(b.ipo.closeDate),
      status: b.ipo.status, band: priceBand(b.ipo), price: b.ipo.priceHigh, lot: b.ipo.lotSize,
      shni: b.totals.shni, bhni: b.totals.bhni, lots: b.totals.lots, shares: b.totals.shares, amount: b.totals.amount,
    });
  }
  const g = report.grand;
  const tr = s.addRow({ name: 'GRAND TOTAL', shni: g.shni, bhni: g.bhni, lots: g.lots, shares: g.shares, amount: g.amount });
  tr.font = { bold: true };
  tr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE3D2' } }; });

  // Sheet 2: account-wise detail
  const d = wb.addWorksheet('Account Detail', { views: [{ state: 'frozen', ySplit: 1 }] });
  d.columns = [
    { header: 'IPO', key: 'ipo', width: 36 },
    { header: 'Open', key: 'open', width: 13 },
    { header: 'Close', key: 'close', width: 13 },
    { header: 'Account', key: 'account', width: 24 },
    { header: 'PAN', key: 'pan', width: 13 },
    { header: 'Category', key: 'category', width: 10 },
    { header: 'Lots', key: 'lots', width: 8 },
    { header: 'Shares', key: 'shares', width: 10 },
    { header: 'Upper Price', key: 'price', width: 11 },
    { header: 'Amount Blocked (Rs)', key: 'amount', width: 18, style: { numFmt: money } },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  head(d.getRow(1));
  for (const b of report.blocks) {
    for (const r of b.rows) {
      d.addRow({ ipo: b.ipo.name, open: fmtDate(b.ipo.openDate), close: fmtDate(b.ipo.closeDate), ...r });
    }
    const st = d.addRow({ ipo: `${b.ipo.name} - Total`, account: `${b.totals.accounts} accounts`, lots: b.totals.lots, shares: b.totals.shares, amount: b.totals.amount });
    st.font = { bold: true };
    st.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; });
  }
  return wb.xlsx.writeBuffer();
}

function toPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    function table(cols, rows, opts = {}) {
      const total = cols.reduce((s, c) => s + c.w, 0);
      const scale = W / total;
      const widths = cols.map((c) => c.w * scale);
      const rowH = 18;
      const drawRow = (vals, style) => {
        if (doc.y + rowH > bottom()) { doc.addPage(); if (!style.header) drawRow(cols.map((c) => c.h), { header: true }); }
        const y = doc.y;
        if (style.header) doc.rect(L, y, W, rowH).fill('#0E2740');
        else if (style.total) doc.rect(L, y, W, rowH).fill('#EAE3D2');
        else if (style.zebra) doc.rect(L, y, W, rowH).fill('#F6F2E8');
        doc.fillColor(style.header ? '#FFFFFF' : '#111111').font(style.header || style.total ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
        let x = L;
        vals.forEach((v, i) => {
          doc.text(String(v ?? ''), x + 4, y + 5, { width: widths[i] - 8, align: cols[i].a || 'left', lineBreak: false, ellipsis: true });
          x += widths[i];
        });
        doc.y = y + rowH;
        doc.x = L;
      };
      drawRow(cols.map((c) => c.h), { header: true });
      rows.forEach((r, i) => drawRow(r.vals, { zebra: i % 2 === 1, total: r.total }));
      doc.moveDown(opts.gap ?? 1);
    }

    // Header: FinDeependence navy strip
    doc.rect(0, 0, doc.page.width, 26).fill('#0E2740');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#7FD3D6').text('FINDEEPENDENCE', L, 9, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF').text('CA Deep Dalal  |  Chartered Accountant  |  Fund Manager', L, 9, { width: W, align: 'right', lineBreak: false });
    doc.x = L; doc.y = 42;
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0E2740').text('IPO Application Report - sHNI / bHNI', L);
    const f = report.filters;
    const scope = [f.from && `From ${fmtDate(f.from)}`, f.to && `To ${fmtDate(f.to)}`, f.category && `Category: ${CAT_LABEL[f.category]}`].filter(Boolean).join('   ');
    doc.font('Helvetica').fontSize(9).fillColor('#555555')
      .text(`Generated: ${new Date(report.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${scope ? '   |   ' + scope : ''}   |   Amounts in Rs at upper price band`);
    doc.moveDown(0.8);

    const g = report.grand;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111')
      .text(`IPOs: ${report.blocks.length}    Applications: ${g.accounts} (sHNI ${g.shni} / bHNI ${g.bhni})    Lots: ${inr(g.lots)}    Shares: ${inr(g.shares)}    Total Blocked: Rs ${inr(g.amount)}`);
    doc.moveDown(0.8);

    // Summary table
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0E2740').text('IPO-wise Summary');
    doc.moveDown(0.3);
    table(
      [
        { h: 'IPO', w: 30 }, { h: 'Open', w: 10 }, { h: 'Close', w: 10 }, { h: 'Status', w: 8 },
        { h: 'Upper Price', w: 9, a: 'right' }, { h: 'Lot', w: 6, a: 'right' }, { h: 'sHNI', w: 6, a: 'right' },
        { h: 'bHNI', w: 6, a: 'right' }, { h: 'Lots', w: 7, a: 'right' }, { h: 'Shares', w: 9, a: 'right' }, { h: 'Amount Blocked', w: 14, a: 'right' },
      ],
      [
        ...report.blocks.map((b) => ({ vals: [b.ipo.name, fmtDate(b.ipo.openDate), fmtDate(b.ipo.closeDate), b.ipo.status, inr(b.ipo.priceHigh), inr(b.ipo.lotSize), b.totals.shni, b.totals.bhni, inr(b.totals.lots), inr(b.totals.shares), inr(b.totals.amount)] })),
        { total: true, vals: ['GRAND TOTAL', '', '', '', '', '', g.shni, g.bhni, inr(g.lots), inr(g.shares), inr(g.amount)] },
      ]
    );

    // Detail per IPO
    for (const b of report.blocks) {
      if (doc.y + 80 > bottom()) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0E2740').text(`${b.ipo.name}${b.ipo.symbol ? ' (' + b.ipo.symbol + ')' : ''}`);
      doc.font('Helvetica').fontSize(8.5).fillColor('#555555')
        .text(`${fmtDate(b.ipo.openDate)} to ${fmtDate(b.ipo.closeDate)}  |  Price band Rs ${priceBand(b.ipo)}  |  Lot ${inr(b.ipo.lotSize)} shares  |  1 lot = Rs ${inr(b.ipo.lotAmount)}`);
      doc.moveDown(0.3);
      table(
        [
          { h: '#', w: 4, a: 'right' }, { h: 'Account', w: 26 }, { h: 'PAN', w: 12 }, { h: 'Category', w: 9 },
          { h: 'Lots', w: 7, a: 'right' }, { h: 'Shares', w: 9, a: 'right' }, { h: 'Upper Price', w: 9, a: 'right' }, { h: 'Amount Blocked', w: 13, a: 'right' }, { h: 'Remarks', w: 16 },
        ],
        [
          ...b.rows.map((r, i) => ({ vals: [i + 1, r.account, r.pan, r.category, inr(r.lots), inr(r.shares), inr(r.price), inr(r.amount), r.remarks] })),
          { total: true, vals: ['', `Total (${b.totals.accounts} accounts)`, '', `${b.totals.shni}S / ${b.totals.bhni}B`, inr(b.totals.lots), inr(b.totals.shares), '', inr(b.totals.amount), ''] },
        ]
      );
    }
    if (!report.blocks.length) doc.font('Helvetica').fontSize(10).fillColor('#555555').text('No applications found for the selected filters.');

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(8).fillColor('#888888')
        .text(`Page ${i + 1} of ${range.count}`, L, doc.page.height - doc.page.margins.bottom - 10, { width: W, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { buildReport, toExcel, toPdf };
