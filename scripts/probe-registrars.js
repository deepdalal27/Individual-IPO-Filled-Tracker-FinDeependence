// One-off check (run by GitHub Actions): which public IPO calendars list BSE SME IPOs and can be read
// automatically (and allow it in robots.txt). Public pages only, honest headers, no personal data.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (ipo calendar)', Accept: 'text/html,application/json' };
const SITES = [
  ['chittorgarh', 'https://www.chittorgarh.com', ['/report/ipo-in-india-list-main-board-sme/82/', '/ipo/ipo_dashboard.asp']],
  ['ipomarket', 'https://www.ipomarket.in', ['/ipo/antala-industries-sme-ipo', '/']],
  ['ipoplus', 'https://ipoplus.in', ['/ipo/antala-industries-ltd-ipo', '/']],
  ['investorgain', 'https://www.investorgain.com', ['/report/live-ipo-gmp/331/', '/']],
  ['ipocentral', 'https://ipocentral.in', ['/']],
  ['indiaipo', 'https://www.indiaipo.in', ['/ipo-blogs/antala-industries-ipo']],
];
async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { status: r.status, type: r.headers.get('content-type') || '', body: await r.text(), url: r.url };
}
(async () => {
  for (const [name, base, paths] of SITES) {
    console.log(`\n===== ${name}`);
    try {
      const rb = await get(base + '/robots.txt');
      const lines = rb.body.split('\n').map((l) => l.trim()).filter((l) => /^(user-agent|disallow|allow|crawl-delay)/i.test(l)).slice(0, 25);
      console.log(`robots ${rb.status}: ${lines.join(' ; ').slice(0, 900)}`);
    } catch (e) { console.log('robots failed ' + e.message); }
    for (const p of paths) {
      try {
        const r = await get(base + p);
        const t = r.body;
        const bot = /just a moment|cf-chl|captcha|access denied|attention required/i.test(t.slice(0, 5000));
        const ant = (t.match(/.{0,120}Antala.{0,200}/i) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const ld = (t.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i) || [])[1];
        const nd = /__NEXT_DATA__/.test(t);
        console.log(`${p} -> ${r.status} ${t.length}B bot-wall:${bot} nextdata:${nd} ld+json:${!!ld}`);
        if (ant) console.log('   antala: ' + ant.slice(0, 320));
      } catch (e) { console.log(`${p} failed ${e.message}`); }
    }
  }
})();
