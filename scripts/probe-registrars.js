// One-off check (run by GitHub Actions): can public IPO calendars be read automatically, and what data do they give?
// Public pages only, honest headers, no personal data.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (ipo calendar)', Accept: 'text/html,application/json' };
async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { status: r.status, body: await r.text(), url: r.url };
}
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' | ').replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').replace(/(\| )+/g, '| ');
function ld(html) { return [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()); }
async function show(name, url, keys) {
  console.log(`\n===== ${name}  ${url}`);
  try {
    const r = await get(url); const t = r.body;
    const wall = /just a moment|cf-chl|challenge-platform|attention required|captcha/i.test(t.slice(0, 8000));
    console.log(`status ${r.status} · ${t.length}B · bot wall: ${wall ? 'YES' : 'no'}`);
    if (wall) return;
    ld(t).slice(0, 3).forEach((j, i) => console.log(`ld+json ${i}: ${j.slice(0, 1800)}`));
    const text = strip(t);
    for (const k of keys) { const m = text.match(new RegExp('.{0,80}' + k + '.{0,260}', 'i')); if (m) console.log(`[${k}] ${m[0]}`); }
  } catch (e) { console.log('failed ' + e.message); }
}
(async () => {
  try { const rb = await get('https://www.ipopremium.in/robots.txt'); console.log('ipopremium robots ' + rb.status + ': ' + rb.body.slice(0, 400).replace(/\s+/g, ' ')); } catch (e) { console.log('robots failed'); }
  await show('ipopremium home', 'https://www.ipopremium.in/', ['Antala', 'SME']);
  await show('ipopremium antala', 'https://www.ipopremium.in/view/ipo/1427/antala-industries-ltd', ['Price', 'Lot', 'Open', 'Close', 'Registrar']);
  await show('investorgain gmp list', 'https://www.investorgain.com/report/live-ipo-gmp/331/', ['Antala', 'Open', 'Close']);
  await show('investorgain antala', 'https://www.investorgain.com/gmp/antala-industries-ipo/2375/', ['Price', 'Lot', 'Open', 'Close', 'Registrar', 'BSE']);
  await show('ipomarket antala', 'https://www.ipomarket.in/ipo/antala-industries-sme-ipo', ['Price Band', 'Lot', 'Open', 'Close', 'Registrar', 'Exchange']);
})();
