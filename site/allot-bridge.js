/* FinDeependence allotment bridge (part of the Tampermonkey script, runs on the HNI IPO Ledger page).
 * Lets the ledger look up allotment results directly, for registrars whose public lookup has no CAPTCHA
 * (currently Bigshare). The lookup goes from YOUR browser straight to the registrar, with only the
 * application number (or PAN if no number is saved), the same as typing it on their page.
 * Nothing is sent to GitHub or any other server.
 */
(function () {
  var BIGSHARE = 'https://ipo.bigshareonline.com/';
  var pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  function req(method, url, body) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: method, url: url, data: body, timeout: 30000,
        headers: body ? { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' } : { Accept: 'text/html' },
        onload: function (r) { resolve({ status: r.status, text: r.responseText, headers: r.responseHeaders || '' }); },
        onerror: function () { reject(new Error('network')); },
        ontimeout: function () { reject(new Error('timeout')); },
      });
    });
  }

  var STOP = { LIMITED: 1, LTD: 1, PVT: 1, PRIVATE: 1, IPO: 1, SME: 1, THE: 1, AND: 1, OF: 1, CO: 1, COMPANY: 1, ISSUE: 1, PUBLIC: 1, EQUITY: 1 };
  function tokens(s) { return String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(function (t) { return t.length > 1 && !STOP[t]; }); }
  function score(text, name) {
    var want = tokens(name), have = tokens(text); if (!want.length || !have.length) return 0;
    var hit = 0; want.forEach(function (t) { if (have.indexOf(t) >= 0) hit++; });
    var extra = have.filter(function (t) { return want.indexOf(t) < 0; }).length;
    return hit / want.length - extra * 0.02;
  }
  function options(html, id) {
    var m = html.match(new RegExp('<select[^>]*id=["\']' + id + '["\'][\\s\\S]*?<\\/select>', 'i'));
    if (!m) return [];
    var out = [], re = /<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)/gi, o;
    while ((o = re.exec(m[0]))) out.push({ value: o[1], text: o[2].trim() });
    return out;
  }

  var listCache = null, listAt = 0;
  function bigshareList() {
    if (listCache && Date.now() - listAt < 10 * 60000) return Promise.resolve(listCache);
    return req('GET', BIGSHARE + 'IPO_Status.html').then(function (r) {
      if (r.status !== 200) throw new Error('list ' + r.status);
      var companies = options(r.text, 'ddlCompany').filter(function (o) { return o.value && !/select/i.test(o.text); });
      var langs = options(r.text, 'ddllang');
      listCache = { companies: companies, lang: (langs[0] && langs[0].value) || '' }; listAt = Date.now();
      return listCache;
    });
  }

  function lookupBigshare(q) {
    return bigshareList().then(function (list) {
      var best = null;
      list.companies.forEach(function (c) { var s = score(c.text, q.ipoName); if (!best || s > best.s) best = { c: c, s: s }; });
      if (!best || best.s < 0.6) return { status: 'NOLIST', message: 'This IPO is not in Bigshare\'s allotment list yet.' };
      var byApp = !!q.appNo;
      var body = JSON.stringify({
        Applicationno: byApp ? String(q.appNo) : '', Company: best.c.value, SelectionType: byApp ? 'AP' : 'PN',
        PanNo: byApp ? '' : String(q.pan || '').toUpperCase(), txtcsdl: '', txtDPID: '', txtClId: '', ddlType: '0', lang: list.lang,
      });
      return req('POST', BIGSHARE + 'Data.aspx/FetchIpodetails', body).then(function (r) {
        if (r.status === 429 || r.status === 503) {
          var w = parseInt((r.headers.match(/retry-after:\s*(\d+)/i) || [])[1], 10);
          return { status: 'RATELIMIT', wait: isNaN(w) || w < 1 ? 30 : w };
        }
        if (r.status !== 200) return { status: 'ERROR', message: 'Bigshare replied ' + r.status };
        var d; try { d = JSON.parse(r.text).d; } catch (e) { return { status: 'ERROR', message: 'Unexpected reply from Bigshare' }; }
        if (!d) return { status: 'ERROR', message: 'Empty reply from Bigshare' };
        if (d.Status === 'RATELIMIT') return { status: 'RATELIMIT', wait: 30, message: d.Message };
        if (d.Status === 'WARMING') return { status: 'RATELIMIT', wait: 10, message: d.Message };
        if (d.Status === 'NOTFOUND') return { status: 'NOTFOUND', ipo: best.c.text };
        if (d.Status && d.Status !== 'OK') return { status: 'ERROR', message: d.Message || d.Status };
        if (/please enter valid/i.test(String(d.DPID || ''))) return { status: 'ERROR', message: d.DPID };
        var rec = d;
        if (d.MatchCount > 1 && d.Records && byApp) rec = d.Records.filter(function (x) { return String(x.APPLICATION_NO).trim() === String(q.appNo).trim(); })[0] || d;
        var allotted = parseInt(String(rec.ALLOTED || '0').replace(/[^0-9]/g, ''), 10) || 0;
        var applied = parseInt(String(rec.APPLIED || '0').replace(/[^0-9]/g, ''), 10) || 0;
        return { status: allotted > 0 ? 'ALLOTTED' : 'NOT', allotted: allotted, applied: applied, ipo: best.c.text };
      });
    });
  }

  var ORIGIN = location.origin;
  function reply(msg) { pageWin.postMessage(msg, ORIGIN); }
  window.addEventListener('message', function (e) {
    if (e.source !== pageWin && e.source !== window) return;
    var m = e.data || {};
    if (m.fdBridgePing) reply({ fdBridge: { version: 2, registrars: ['bigshare'] } });
    if (m.fdLookup) {
      var q = m.fdLookup;
      var job = q.registrar === 'bigshare' ? lookupBigshare(q) : Promise.resolve({ status: 'UNSUPPORTED' });
      job.then(function (res) { reply({ fdLookupResult: Object.assign({ id: q.id }, res) }); })
        .catch(function (err) { reply({ fdLookupResult: { id: q.id, status: 'ERROR', message: String(err && err.message || err) } }); });
    }
  });
  reply({ fdBridge: { version: 2, registrars: ['bigshare'] } });
})();
