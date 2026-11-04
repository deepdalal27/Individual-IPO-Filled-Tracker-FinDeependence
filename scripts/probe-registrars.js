// One-off check (run by GitHub Actions): does each registrar's public allotment page use a CAPTCHA?
// Reads public pages only. No PAN, application number or other personal data is sent anywhere.
const PAGES = [
  ['KFin Technologies', 'https://ipostatus.kfintech.com/'],
  ['MUFG Intime (Link Intime)', 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html'],
  ['Bigshare Services', 'https://ipo.bigshareonline.com/IPO_Status.html'],
  ['Cameo Corporate Services', 'https://ipo.cameoindia.com/'],
  ['Skyline Financial Services', 'https://www.skylinerta.com/ipo.php'],
  ['Purva Sharegistry', 'https://www.purvashare.com/investor-service/ipo-query'],
  ['Maashitla Securities', 'https://maashitla.com/allotment-status/public-issues'],
  ['Integrated Registry', 'https://www.integratedregistry.in/'],
  ['BSE allotment', 'https://www.bseindia.com/investors/appli_check.aspx'],
];
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (allotment page check)' };
const CAPTCHA = /captcha|recaptcha|hcaptcha|turnstile|g-recaptcha|cf-chl|challenge-platform/i;

async function get(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { status: res.status, url: res.url, type: res.headers.get('content-type') || '', body: await res.text() };
}
const uniq = (a) => [...new Set(a)];

(async () => {
  for (const [name, url] of PAGES) {
    console.log(`\n=== ${name} — ${url}`);
    try {
      const r = await get(url);
      const html = r.body;
      const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
      console.log(`status ${r.status} · final ${r.url} · ${html.length} bytes · title "${title.trim().slice(0, 80)}"`);
      const capLines = uniq((html.match(new RegExp(`.{0,60}(${CAPTCHA.source}).{0,60}`, 'gi')) || []).map((s) => s.replace(/\s+/g, ' ').trim())).slice(0, 6);
      console.log(`captcha on page: ${capLines.length ? 'YES' : 'no'}`);
      capLines.forEach((l) => console.log('   · ' + l.slice(0, 140)));
      const forms = (html.match(/<form[^>]*>/gi) || []).slice(0, 5);
      forms.forEach((f) => console.log('form: ' + f.slice(0, 160)));
      const inputs = uniq((html.match(/<(input|select)[^>]*(name|id)="[^"]+"[^>]*>/gi) || []).map((t) => (t.match(/(?:name|id)="([^"]+)"/i) || [])[1])).slice(0, 25);
      if (inputs.length) console.log('fields: ' + inputs.join(', '));
      // Same-site scripts: look for CAPTCHA use and the endpoint the page submits to.
      const base = new URL(r.url);
      const scripts = uniq((html.match(/<script[^>]+src="([^"]+)"/gi) || []).map((t) => t.match(/src="([^"]+)"/i)[1]))
        .map((s) => { try { return new URL(s, base); } catch { return null; } })
        .filter((u) => u && u.hostname.endsWith(base.hostname.split('.').slice(-2).join('.'))).slice(0, 6);
      const ends = uniq((html.match(/["'`](\/?[A-Za-z0-9_\-./]*(?:api|Api|API|asmx|ashx|aspx\/[A-Za-z]+|Search[A-Za-z]*|Get[A-Za-z]*Status)[A-Za-z0-9_\-./]*)["'`]/g) || []).map((s) => s.slice(1, -1))).slice(0, 12);
      for (const s of scripts) {
        try {
          const js = (await get(s.href)).body;
          const cap = CAPTCHA.test(js);
          const e = uniq((js.match(/["'`](\/?[A-Za-z0-9_\-./]*(?:api|Api|API|asmx|ashx|Search[A-Za-z]*|Get[A-Za-z]*Status)[A-Za-z0-9_\-./]*)["'`]/g) || []).map((x) => x.slice(1, -1))).slice(0, 10);
          console.log(`script ${s.pathname.slice(0, 70)} · ${js.length} bytes · captcha ${cap ? 'YES' : 'no'}${e.length ? ' · endpoints ' + e.join(' ') : ''}`);
        } catch (err) { console.log(`script ${s.pathname}: ${err.message}`); }
      }
      if (ends.length) console.log('endpoints in page: ' + ends.join(' '));
    } catch (e) {
      console.log('could not load: ' + e.message);
    }
  }
})();
