// One-off check (run by GitHub Actions): what BSE's public IPO listings return. Public pages only, no personal data.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (ipo calendar)', Accept: 'application/json, text/html' };
const H2 = UA; // honest headers only
const URLS = [
  ['page current', 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=1&Type=p', UA],
  ['page upcoming', 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=2&Type=p', UA],
  ['api current', 'https://api.bseindia.com/BseIndiaAPI/api/IPOIssues/w?id=1&type=p', H2],
  ['api current2', 'https://api.bseindia.com/BseIndiaAPI/api/PublicIssue/w?flag=1', H2],
  ['api ddl', 'https://api.bseindia.com/BseIndiaAPI/api/DDLIPOIssue/w', H2],
  ['nse sme', 'https://www.nseindia.com/api/all-upcoming-issues?category=sme', UA],
  ['nse past', 'https://www.nseindia.com/api/public-past-issues', UA],
];
(async () => {
  for (const [name, url, headers] of URLS) {
    try {
      const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      console.log(`\n=== ${name}: ${r.status} ${r.headers.get('content-type')} ${t.length}B final=${r.url}`);
      if (/json/.test(r.headers.get('content-type') || '') || /^\s*[[{]/.test(t)) { console.log(t.slice(0, 1500)); continue; }
      const title = (t.match(/<title[^>]*>([^<]*)/i) || [])[1];
      console.log('title: ' + (title || '').trim());
      const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ').replace(/\|[\s|]*/g, ' | ').trim()).filter((x) => /\d{2}[-\/ ][A-Za-z]{3}|\d{2}\/\d{2}\/\d{4}/.test(x));
      console.log(`rows with dates: ${rows.length}`); rows.slice(0, 25).forEach((x) => console.log('  ' + x.slice(0, 220)));
      const apis = [...new Set((t.match(/https?:\/\/api\.bseindia\.com\/[A-Za-z0-9_\/.?=&-]+/g) || []))].slice(0, 15);
      if (apis.length) console.log('api urls in page: ' + apis.join(' '));
      const ang = [...new Set((t.match(/(?:IPO|Issue|Public)[A-Za-z]*\/w[^"'\s]*/g) || []))].slice(0, 15);
      if (ang.length) console.log('api paths in page: ' + ang.join(' '));
    } catch (e) { console.log(`\n=== ${name}: failed ${e.message}`); }
  }
})();
