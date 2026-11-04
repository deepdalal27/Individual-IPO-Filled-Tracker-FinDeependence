// ==UserScript==
// @name         FinDeependence IPO allotment auto-fill
// @namespace    https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/
// @version      1.0.0
// @description  Fills the IPO and application number on registrar allotment pages opened from the HNI IPO Ledger. You type the CAPTCHA.
// @author       FinDeependence
// @match        *://ipostatus.kfintech.com/*
// @match        *://*.kfintech.com/*
// @match        *://in.mpms.mufg.com/*
// @match        *://*.mpms.mufg.com/*
// @match        *://*.linkintime.co.in/*
// @match        *://ipo.bigshareonline.com/*
// @match        *://*.bigshareonline.com/*
// @match        *://ipo.cameoindia.com/*
// @match        *://*.cameoindia.com/*
// @match        *://www.skylinerta.com/*
// @match        *://*.purvashare.com/*
// @match        *://maashitla.com/*
// @match        *://*.maashitla.com/*
// @match        *://*.integratedregistry.in/*
// @match        *://www.bseindia.com/investors/*
// @run-at       document-start
// @grant        none
// @updateURL    https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/fd-allotment.user.js
// @downloadURL  https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/fd-allotment.user.js
// ==/UserScript==
window.__fdipoAuto = true;
/* FinDeependence allotment auto-fill helper.
 * Runs on a registrar's allotment page (as a bookmarklet or a Tampermonkey userscript).
 * Reads the IPO name + application number (or PAN) that the HNI IPO Ledger put after "#fdipo="
 * in the address (the part after # never leaves your browser), then:
 *   1. picks the IPO in the page's IPO list,
 *   2. chooses "Application No." (or PAN) as the search type,
 *   3. types the number,
 *   4. puts the cursor in the CAPTCHA box. You type the CAPTCHA and submit yourself.
 */
(function () {
  if (window.__fdipoHelper) { window.__fdipoHelper.run(); return; }
  var STORE = 'fdipo-payload';

  function decode(raw) {
    try {
      var b = raw.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return null; }
  }
  function readPayload() {
    var m = String(location.hash || '').match(/fdipo=([A-Za-z0-9_-]+)/);
    var raw = m && m[1];
    try { if (raw) sessionStorage.setItem(STORE, raw); else raw = sessionStorage.getItem(STORE); } catch (e) {}
    return raw ? decode(raw) : null;
  }

  // ---- matching helpers ----
  var STOP = { LIMITED: 1, LTD: 1, PVT: 1, PRIVATE: 1, IPO: 1, SME: 1, THE: 1, AND: 1, OF: 1, CO: 1, COMPANY: 1, ISSUE: 1, PUBLIC: 1, EQUITY: 1, NSE: 1, BSE: 1 };
  function tokens(s) {
    return String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(function (t) { return t.length > 1 && !STOP[t]; });
  }
  function score(text, p) {
    var want = tokens(p.i), have = tokens(text);
    if (!want.length || !have.length) return 0;
    var hit = 0;
    want.forEach(function (t) { if (have.indexOf(t) >= 0) hit++; });
    var s = hit / want.length;
    if (p.s && new RegExp('\\b' + p.s.replace(/[^A-Z0-9]/gi, '') + '\\b', 'i').test(text)) s += 0.5;
    return s;
  }
  function docs() {
    var out = [document];
    Array.prototype.forEach.call(document.querySelectorAll('iframe,frame'), function (f) {
      try { if (f.contentDocument && f.contentDocument.body) out.push(f.contentDocument); } catch (e) { /* other site: skip */ }
    });
    return out;
  }
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  function labelOf(el) {
    var d = el.ownerDocument, txt = '';
    if (el.id) { var l = d.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]'); if (l) txt += ' ' + l.textContent; }
    var pl = el.closest('label'); if (pl) txt += ' ' + pl.textContent;
    var sib = el.nextSibling; if (sib && sib.textContent) txt += ' ' + sib.textContent.slice(0, 40);
    var prev = el.previousElementSibling; if (prev && /LABEL|SPAN|B|STRONG|TD/.test(prev.tagName)) txt += ' ' + prev.textContent.slice(0, 40);
    var cell = el.closest('td'); if (cell && cell.previousElementSibling) txt += ' ' + cell.previousElementSibling.textContent.slice(0, 40);
    return [el.id, el.name, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.title, el.value && el.type === 'radio' ? el.value : '', txt].join(' ');
  }
  function fire(el, types) {
    types.forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
  }
  function setValue(el, v) {
    var proto = Object.getPrototypeOf(el), desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    fire(el, ['input', 'change', 'keyup', 'blur']);
  }
  function chooseOption(sel, opt) {
    if (sel.value === opt.value && sel.selectedIndex === opt.index) return false;
    sel.selectedIndex = opt.index;
    var w = sel.ownerDocument.defaultView;
    if (w && w.jQuery) { try { w.jQuery(sel).val(opt.value).trigger('change'); } catch (e) {} }
    fire(sel, ['input', 'change']);
    return true;
  }

  // ---- steps ----
  function pickIpo(p) {
    var best = null;
    docs().forEach(function (d) {
      Array.prototype.forEach.call(d.querySelectorAll('select'), function (sel) {
        if (sel.options.length < 2) return;
        Array.prototype.forEach.call(sel.options, function (o) {
          var sc = score(o.textContent, p);
          if (!best || sc > best.sc) best = { sel: sel, opt: o, sc: sc };
        });
      });
    });
    if (!best || best.sc < 0.5) return { found: false };
    return { found: true, changed: chooseOption(best.sel, best.opt), name: best.opt.textContent.trim() };
  }
  function wantPan(p) { return !p.a && !!p.p; }
  function pickMode(p) {
    var re = wantPan(p) ? /\bPAN\b/i : /APPL|APPLICATION|APP\.?\s*NO/i, avoid = wantPan(p) ? /APPLICATION/i : /\bPAN\b|DP\s*ID|DEMAT|CLIENT/i;
    var done = false;
    docs().forEach(function (d) {
      if (done) return;
      // radio buttons
      Array.prototype.forEach.call(d.querySelectorAll('input[type=radio]'), function (r) {
        if (done) return;
        var l = labelOf(r);
        if (re.test(l) && !avoid.test(l.replace(re, ''))) { if (!r.checked) { r.click(); fire(r, ['change']); } done = true; }
      });
      // or a "search by" dropdown
      if (!done) Array.prototype.forEach.call(d.querySelectorAll('select'), function (sel) {
        if (done) return;
        var opts = Array.prototype.slice.call(sel.options);
        if (!opts.some(function (o) { return /PAN/i.test(o.textContent); }) || !opts.some(function (o) { return /APPL/i.test(o.textContent); })) return;
        var o = opts.filter(function (o) { return re.test(o.textContent); })[0];
        if (o) { chooseOption(sel, o); done = true; }
      });
    });
    return done;
  }
  function textInputs() {
    var out = [];
    docs().forEach(function (d) {
      Array.prototype.forEach.call(d.querySelectorAll('input'), function (el) {
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        if (['text', 'search', 'number', 'tel', ''].indexOf(t) >= 0 && !el.disabled && !el.readOnly && visible(el)) out.push(el);
      });
    });
    return out;
  }
  function isCaptcha(el) { return /CAPTCHA|SECURITY|VERIFICATION|CODE|CAPCHA/i.test(labelOf(el)); }
  function fillNumber(p) {
    var key = wantPan(p) ? String(p.p).toUpperCase() : String(p.a);
    var re = wantPan(p) ? /\bPAN\b/i : /APPL|APPLICATION|APP\.?\s*NO|ACK/i;
    var ins = textInputs().filter(function (el) { return !isCaptcha(el); });
    var el = ins.filter(function (x) { return re.test(labelOf(x)); })[0] || ins.filter(function (x) { return /SEARCH|ENTER|NUMBER|VALUE|INPUT|TXT/i.test(labelOf(x)); })[0] || (ins.length === 1 ? ins[0] : null);
    if (!el) return false;
    if (el.value !== key) setValue(el, key);
    return true;
  }
  function focusCaptcha() {
    var c = textInputs().filter(isCaptcha)[0];
    if (c) { c.focus(); c.scrollIntoView({ block: 'center' }); }
    return !!c;
  }

  // ---- small on-page banner ----
  function banner(html, ok) {
    var b = document.getElementById('fdipo-banner');
    if (!b) {
      b = document.createElement('div'); b.id = 'fdipo-banner';
      b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;font:13px/1.45 system-ui,Segoe UI,sans-serif;background:#0E2740;color:#fff;border-radius:12px;padding:12px 14px 12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.35)';
      document.body.appendChild(b);
    }
    b.style.borderLeft = '5px solid ' + (ok ? '#3C9A08' : '#F0B45A');
    b.innerHTML = '<div style="font:700 10px/1 monospace;letter-spacing:.14em;color:#7FD3D6;margin-bottom:6px">FINDEEPENDENCE · ALLOTMENT</div>' + html +
      '<div style="margin-top:8px;text-align:right"><button style="background:none;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer">Close</button></div>';
    b.querySelector('button').onclick = function () { b.remove(); };
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var timer = null;
  function run(given) {
    var p = given || readPayload();
    if (!p) { banner('Open this page from the <b>Check allotment</b> button in your HNI IPO Ledger, then click the bookmark again.', false); return; }
    clearTimeout(timer);
    var tries = 0, ipo = null, mode = false, filled = false, waitAfterIpo = 0;
    (function step() {
      tries++;
      if (!ipo || !ipo.found) { ipo = pickIpo(p); if (ipo.found && ipo.changed) waitAfterIpo = 2; }
      if (waitAfterIpo > 0) { waitAfterIpo--; timer = setTimeout(step, 450); return; }
      if (!mode) mode = pickMode(p);
      filled = fillNumber(p);
      if ((filled && (ipo.found || tries > 6)) || tries >= 24) {
        var cap = filled && focusCaptcha();
        var key = wantPan(p) ? 'PAN ' + esc(String(p.p).toUpperCase()) : 'Application no. <b>' + esc(p.a) + '</b>';
        var lines = [];
        lines.push((ipo.found ? '✓ IPO selected: <b>' + esc(ipo.name) + '</b>' : '⚠ Could not find <b>' + esc(p.i) + '</b> in the IPO list. Please pick it yourself.'));
        lines.push(filled ? '✓ ' + key + ' filled' : '⚠ Could not find the number box. Paste it yourself: ' + key);
        if (p.n) lines.push('Account: ' + esc(p.n));
        lines.push(cap ? '→ Type the CAPTCHA and submit.' : '→ Complete any CAPTCHA and submit.');
        banner(lines.join('<br>'), ipo.found && filled);
        return;
      }
      timer = setTimeout(step, 450);
    })();
  }

  window.__fdipoHelper = { run: run };
  var auto = !!window.__fdipoAuto; // set by the userscript: stay quiet on pages not opened from the ledger
  var first = readPayload();
  window.addEventListener('hashchange', function () { if (/fdipo=/.test(location.hash)) run(); });
  window.addEventListener('message', function (e) { if (e.data && e.data.fdipo) { try { sessionStorage.setItem(STORE, e.data.fdipo); } catch (x) {} run(decode(e.data.fdipo)); } });
  if (auto && !first) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { run(first); }); else run(first);
})();
