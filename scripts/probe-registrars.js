// One-off check (run by GitHub Actions): does each registrar's public allotment lookup use a CAPTCHA?
// Reads public pages and their scripts only. No PAN, application number or other personal data is sent.
const UA = { 'User-Agent': 'findeependence-ipo-ledger/1.0 (allotment page check)' };
const CAP = /captcha|recaptcha|hcaptcha|turnstile|securitycode|security code|verification code|otp/i;

async function get(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { status: res.status, url: res.url, body: await res.text() };
}
const uniq = (a) => [...new Set(a)];
function around(text, re, width = 110, max = 8) {
  const out = []; let m; const g = new RegExp(re.source, 'gi');
  while ((m = g.exec(text)) && out.length < max) out.push(text.slice(Math.max(0, m.index - width), m.index + width).replace(/\s+/g, ' '));
  return uniq(out);
}
function scriptsOf(html, base) {
  return uniq((html.match(/<script[^>]+src=["']([^"']+)["']/gi) || []).map((t) => t.match(/src=["']([^"']+)["']/i)[1]))
    .map((s) => { try { return new URL(s, base).href; } catch { return null; } }).filter(Boolean);
}
async function deep(name, url, keys) {
  console.log(`\n=== ${name} — ${url}`);
  try {
    const r = await get(url);
    console.log(`status ${r.status} · ${r.body.length} bytes · final ${r.url}`);
    const srcs = scriptsOf(r.body, r.url);
    console.log('scripts: ' + srcs.map((s) => new URL(s).pathname).join(' '));
    const texts = [['page', r.body]];
    for (const s of srcs.filter((s) => new URL(s).hostname === new URL(r.url).hostname).slice(0, 6)) {
      try { const j = await get(s); texts.push([new URL(s).pathname, j.body]); } catch (e) { console.log('script failed ' + s); }
    }
    for (const [where, t] of texts) {
      const cap = around(t, CAP, 90, 5);
      console.log(`[${where}] ${t.length} bytes · captcha/otp mentions: ${cap.length}`);
      cap.forEach((c) => console.log('   cap · ' + c));
      for (const k of keys) around(t, new RegExp(k), 120, 4).forEach((c) => console.log(`   ${k} · ${c}`));
    }
  } catch (e) { console.log('could not load: ' + e.message); }
}

(async () => {
  await deep('KFin Technologies', 'https://ipostatus.kfintech.com/', ['api', 'allot', 'pan']);
  await deep('Bigshare Services', 'https://ipo.bigshareonline.com/IPO_Status.html', ['FetchIpodetails', 'Data\\.aspx', 'txtapplication', 'btn_Search']);
  await deep('Cameo Corporate Services', 'https://ipo.cameoindia.com/', ['https?://[a-z0-9.\\-]+/[a-z0-9_\\-/]*', 'allot', 'applicationno']);
  await deep('Skyline (search page)', 'https://www.skylinerta.com/display_application.php', ['<input', '<form', 'action=']);
  await deep('Maashitla Securities', 'https://maashitla.com/allotment-status/public-issues', ['allot', '/api/', 'https?://[a-z0-9.\\-]+/api']);
})();
