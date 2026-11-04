// Builds site/fd-allotment.user.js (Tampermonkey / Violentmonkey userscript) from site/allot-helper.js.
const fs = require('fs');
const path = require('path');
const site = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(site, 'allot-helper.js'), 'utf8');
const matches = [
  '*://ipostatus.kfintech.com/*', '*://*.kfintech.com/*', '*://in.mpms.mufg.com/*', '*://*.mpms.mufg.com/*', '*://*.linkintime.co.in/*',
  '*://ipo.bigshareonline.com/*', '*://*.bigshareonline.com/*', '*://ipo.cameoindia.com/*', '*://*.cameoindia.com/*',
  '*://www.skylinerta.com/*', '*://*.purvashare.com/*', '*://maashitla.com/*', '*://*.maashitla.com/*', '*://*.integratedregistry.in/*',
  '*://www.bseindia.com/investors/*',
];
const header = `// ==UserScript==
// @name         FinDeependence IPO allotment auto-fill
// @namespace    https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/
// @version      1.0.0
// @description  Fills the IPO and application number on registrar allotment pages opened from the HNI IPO Ledger. You type the CAPTCHA.
// @author       FinDeependence
${matches.map((m) => `// @match        ${m}`).join('\n')}
// @run-at       document-start
// @grant        none
// @updateURL    https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/fd-allotment.user.js
// @downloadURL  https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/fd-allotment.user.js
// ==/UserScript==
window.__fdipoAuto = true;
`;
fs.writeFileSync(path.join(site, 'fd-allotment.user.js'), header + src);
console.log('Built site/fd-allotment.user.js');
