# HNI IPO Ledger · FinDeependence

**Open the app:** https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/

Tracks IPO applications from your individual accounts in the **sHNI** and **bHNI** categories,
and gives IPO-wise reports you can download as **Excel** or **PDF**.

## How it works

- **New IPOs arrive automatically.** A GitHub Actions workflow
  (`.github/workflows/pages.yml`) runs every 3 hours. It pulls current and upcoming mainboard
  IPOs from NSE (dates, price band, lot size) into `site/ipos.json`, then republishes the site
  on GitHub Pages. You can also run it straight away from **Actions → Update IPOs and publish site → Run workflow**.
- **Apply tab:** pick the IPO, then click **sHNI**, **bHNI** or **None** for each account. Lots
  default to the category minimum at the upper price band:
  - sHNI minimum = the fewest lots above ₹2,00,000 (maximum ₹10,00,000)
  - bHNI minimum = the fewest lots above ₹10,00,000

  You can change the lots for an account within the category limits.
- **Reports tab:** sHNI/bHNI account counts, total lots, total shares and amount blocked for each IPO,
  a grand total, and account-wise detail. Filter by date, IPO or category, then download Excel or PDF.
- **IPOs tab:** add an IPO by hand or correct one. Your edits stay even when the NSE list updates.
- **Accounts tab:** the 24 account holders are pre-filled. Rename them, add PAN and notes, or add more.

## Where your data is kept

Accounts, PAN numbers and applications are saved **in your browser** on the device you use. They
are never uploaded to GitHub. Use **Accounts → Download backup** now and then. To use another computer or browser,
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
