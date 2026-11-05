// One-off check (run by GitHub Actions): raw layout of investorgain's live IPO list (public page, allowed by robots.txt).
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (ipo calendar)', Accept: 'text/html' };
(async () => {
  const r = await fetch('https://www.investorgain.com/report/live-ipo-gmp/331/', { headers: UA, signal: AbortSignal.timeout(25000) });
  const t = await r.text();
  console.log(`status ${r.status} ${t.length}B`);
  const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  console.log(`tr count ${rows.length}`);
  rows.filter((x) => /Antala|Vedant/i.test(x)).slice(0, 2).forEach((x, i) => console.log(`\n--- row ${i} (${x.length} chars)\n` + x.replace(/\s+/g, ' ').slice(0, 3500)));
  const head = rows.find((x) => /<th/i.test(x)); if (head) console.log('\n--- header\n' + head.replace(/\s+/g, ' ').slice(0, 2500));
  const apis = [...new Set(t.match(/https?:\/\/[a-z0-9.-]*investorgain[a-z0-9.-]*\/[A-Za-z0-9_\/.?=&-]*(?:report|data|api)[A-Za-z0-9_\/.?=&-]*/gi) || [])].slice(0, 15);
  console.log('\napi-like urls: ' + apis.join('  '));
  const i = t.indexOf('Antala'); console.log('\nfirst Antala context: ' + t.slice(Math.max(0, i - 600), i + 600).replace(/\s+/g, ' '));
})();
