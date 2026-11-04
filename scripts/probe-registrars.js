// One-off check (run by GitHub Actions): how Bigshare's public, CAPTCHA-free allotment lookup works.
// Reads the public page only. No lookup is sent and no personal data is used.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (allotment page check)' };
(async () => {
  const html = await (await fetch('https://ipo.bigshareonline.com/IPO_Status.html', { headers: UA })).text();
  const sel = (html.match(/<select[^>]*id="ddlCompany"[\s\S]*?<\/select>/i) || [''])[0];
  const opts = [...sel.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)/gi)].map((m) => `${m[1]} = ${m[2].trim()}`);
  console.log(`ddlCompany options in page: ${opts.length}`); opts.slice(0, 15).forEach((o) => console.log('  ' + o));
  ['ddlType', 'SelectionType'].forEach((id) => {
    const s = (html.match(new RegExp(`<select[^>]*id="${id}"[\\s\\S]*?<\\/select>`, 'i')) || [''])[0];
    console.log(`${id}: ` + [...s.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)/gi)].map((m) => `${m[1]}=${m[2].trim()}`).join(' | '));
  });
  // Print every inline script that mentions the lookup or the company list, in full.
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  scripts.filter((s) => /FetchIpodetails|ddlCompany|lockSearch|Data\.aspx/.test(s)).forEach((s, i) => {
    console.log(`\n----- inline script ${i + 1} (${s.length} chars) -----`);
    console.log(s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').slice(0, 12000));
  });
})();
