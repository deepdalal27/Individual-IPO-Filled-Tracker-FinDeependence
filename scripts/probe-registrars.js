// One-off check (run by GitHub Actions): page layout of ipopremium.in IPO pages + sitemap, and investorgain's list.
// Public pages only (allowed by their robots.txt), honest headers, no personal data.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (ipo calendar)', Accept: 'text/html,application/xml' };
async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { status: r.status, body: await r.text() };
}
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' | ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8377;/g, '₹').replace(/&ndash;/g, '-').replace(/\s+/g, ' ').replace(/(\| )+/g, '| ');
(async () => {
  const sm = await get('https://www.ipopremium.in/sitemap.xml');
  console.log(`sitemap ${sm.status} ${sm.body.length}B`); console.log(sm.body.slice(0, 1500));
  const subs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 10);
  console.log('first locs: ' + subs.join(' '));
  for (const s of subs.filter((u) => /sitemap/i.test(u)).slice(0, 3)) {
    const x = await get(s); console.log(`\nsub ${s} ${x.status} ${x.body.length}B`); console.log(x.body.slice(0, 1200));
  }
  const p = await get('https://www.ipopremium.in/view/ipo/1427/antala-industries-ltd');
  console.log(`\nantala page ${p.status}`);
  const t = strip(p.body);
  const i = t.indexOf('Price Band');
  console.log(t.slice(Math.max(0, i - 300), i + 2200));
  const r = t.indexOf('Registrar |'); if (r > 0) console.log('\nREGISTRAR: ' + t.slice(r, r + 500));
  const tl = t.search(/Timeline|Tentative/i); if (tl > 0) console.log('\nTIMELINE: ' + t.slice(tl, tl + 900));
})();
