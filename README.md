# HNI IPO Ledger · FinDeependence

**Open the app:** https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/

Tracks IPO applications from your individual accounts in the **sHNI** and **bHNI** categories,
and gives IPO-wise reports you can download as **Excel** or **PDF**.

## How it works

- **New IPOs arrive automatically**, mainboard and SME, NSE and BSE. A GitHub Actions workflow
  (`.github/workflows/pages.yml`) runs about every 30 minutes and merges three free public sources into `site/ipos.json`:
  NSE's IPO feed (primary), ipopremium.in IPO pages (adds BSE SME / BSE-only IPOs with price band, lot size,
  dates and registrar), and investorgain.com's live IPO list (fills any gaps). Pages that show a bot check are
  skipped, never bypassed. The app shows a **New IPOs** alert for open and upcoming IPOs you haven't seen yet, and
  when the list was last checked.
- **Apply tab:** pick the IPO, then click **sHNI**, **bHNI** or **None** for each account. Lots
  default to the category minimum at the upper price band:
  - sHNI minimum = the fewest lots above ₹2,00,000 (maximum ₹10,00,000)
  - bHNI minimum = the fewest lots above ₹10,00,000

  You can change the lots for an account within the category limits, and enter its **Application no.**
  Each application number can be used only once across all IPOs and accounts (capitals and spaces are ignored when checking).
- **Allotment tab:** for each IPO you applied in, every account with its application number.
  **Check allotment ↗** copies the application number (or PAN if no number is entered) and opens the IPO's
  registrar page (KFin, MUFG Intime, Bigshare, Cameo, Skyline, Purva, Maashitla, Integrated; BSE as fallback).
  With the one-time **auto-fill** setup (a bookmark button, or the Tampermonkey script `site/fd-allotment.user.js`),
  the registrar page picks the IPO, chooses Application No. or PAN and fills the number by itself. You type the CAPTCHA
  and submit. The details travel after `#` in the address, which is never sent to the registrar's server.
  Then click **Allotted** or **Not allotted**.
  **Bigshare IPOs are fully automatic:** Bigshare's public lookup has no CAPTCHA, so with the Tampermonkey script
  (version 2) installed, the app checks every pending account by itself once results are out, and again every
  30 minutes while the app is open. It records Allotted / Not allotted and the shares. Lookups go from your browser
  straight to Bigshare, one at a time with a pause between them, and wait whenever Bigshare asks. Your PANs and
  application numbers are never sent to GitHub or any other server. Registrars with a CAPTCHA (KFin, MUFG Intime,
  BSE) stay one-click. **Check all accounts** steps through every
  pending account one by one, copying each number for you. The tab shows allotted / not allotted / pending counts,
  shares allotted and the amount to be unblocked. Registrar pages use CAPTCHAs and don't let other websites read them,
  so the result is recorded with one click instead of being fetched automatically. Allotment results appear in the
  reports, Excel and PDF too.
- **Reports tab** has four views. Filter by date, IPO, account or category (sHNI, bHNI or None):
  - **By IPO:** for each IPO, how many accounts applied, with sHNI, bHNI and None counts, lots, shares and
    amount blocked, plus the account list for each IPO.
  - **By account:** for each account, how many IPOs it applied in (sHNI, bHNI, None), its hit rate and amount
    blocked, plus that account's full IPO history.
  - **Matrix:** accounts × IPOs grid (S / B / –) with totals for each row and column.
  - **All rows:** every IPO × account pair, including None.

  Use **Download** to choose the full report or just one section (By IPO, By account, Matrix, All rows), then click Excel or PDF.
  By account includes each account's IPO-by-IPO history with application numbers. Click any IPO or account name to see only that IPO or account. Click a column header to sort (name A–Z, open or close date,
  amount, accounts applied), or use the Sort, Type, Status and Search filters. **Download Excel** gives a formatted workbook with five sheets: Dashboard, IPO-wise, Account-wise, Matrix and All rows.
  Conditional formatting colours sHNI teal, bHNI blue and None grey. Header filters sort A–Z or by open/close date,
  dates are real Excel dates, and totals use SUBTOTAL/COUNTIF so they follow your filters. **Download PDF** gives the same
  summaries, the matrix, and the account list for each IPO.
- **IPOs tab:** lists every IPO received from NSE. You only add one by hand if it's missing. Your edits stay even when the NSE list updates.
- **Accounts tab:** the 24 account holders are pre-filled. Rename them, add PAN and notes, or add more.

## Where your data is kept

Accounts, PAN numbers and applications are saved **in your browser** on the device you use. They
are never uploaded to GitHub. Backups come as a **backup file**, an **Excel backup** (both can be restored) and a **PDF backup** (a printable record). The app keeps your history from now on and asks the browser not to clear it. A reminder appears when you have new entries that aren't backed up. Use **Download backup** when it does. To use another computer or browser,
open the app there and use **Restore backup**.

The repository is public. Only the IPO list and the default account names (`site/accounts.js`)
are in it.

## Files

| Path | What it is |
|---|---|
| `site/` | The website (published to GitHub Pages) |
| `site/ipos.json` | IPO list, updated by the workflow |
| `site/accounts.js` | Account names pre-filled on first visit |
| `scripts/sync-ipos.js`, `src/nse.js` | NSE fetch used by the workflow |
| `src/calc.js` | sHNI / bHNI lot rules (tested in `test/`) |

Preview it locally with `npm start`, which serves the site at http://localhost:3000, and run the tests with `npm test`.
