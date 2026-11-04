// Builds site/fd-allotment.user.js (Tampermonkey / Violentmonkey userscript):
//  - on the HNI IPO Ledger page: allot-bridge.js (automatic Bigshare allotment lookups from your browser)
//  - on registrar pages: allot-helper.js (fills the IPO and application number; you type the CAPTCHA)
const fs = require('fs');
const path = require('path');
const site = path.join(__dirname, '..', 'site');
const helper = fs.readFileSync(path.join(site, 'allot-helper.js'), 'utf8');
const bridge = fs.readFileSync(path.join(site, 'allot-bridge.js'), 'utf8');
const APP = 'https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/';
const matches = [
  APP + '*',
  '*://ipostatus.kfintech.com/*', '*://*.kfintech.com/*', '*://in.mpms.mufg.com/*', '*://*.mpms.mufg.com/*', '*://*.linkintime.co.in/*',
  '*://ipo.bigshareonline.com/*', '*://*.bigshareonline.com/*', '*://ipo.cameoindia.com/*', '*://*.cameoindia.com/*',
  '*://www.skylinerta.com/*', '*://*.purvashare.com/*', '*://maashitla.com/*', '*://*.maashitla.com/*', '*://*.integratedregistry.in/*',
  '*://www.bseindia.com/investors/*',
];
const header = `// ==UserScript==
// @name         FinDeependence IPO allotment
// @namespace    ${APP}
// @version      2.0.0
// @description  Automatic Bigshare allotment checks from your own browser, and auto-fill of registrar allotment forms opened from the HNI IPO Ledger. Your PANs never leave your browser except to the registrar you are checking.
// @author       FinDeependence
${matches.map((m) => `// @match        ${m}`).join('\n')}
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      ipo.bigshareonline.com
// @updateURL    ${APP}fd-allotment.user.js
// @downloadURL  ${APP}fd-allotment.user.js
// ==/UserScript==
`;
const body = `if (location.hostname === 'deepdalal27.github.io' || window.__fdBridgeTest) {
${bridge}
} else {
window.__fdipoAuto = true;
${helper}
}
`;
fs.writeFileSync(path.join(site, 'fd-allotment.user.js'), header + body);
console.log('Built site/fd-allotment.user.js');
