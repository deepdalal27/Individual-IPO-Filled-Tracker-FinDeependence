# HNI IPO Ledger · FinDeependence

**Open the app:** https://deepdalal27.github.io/Individual-IPO-Filled-Tracker-FinDeependence/

Tracks IPO applications from your individual accounts in the **sHNI** and **bHNI** categories,
and gives IPO-wise reports you can download as **Excel** or **PDF**.

## How it works

- **New IPOs arrive automatically.** A GitHub Actions workflow
  (`.github/workflows/pages.yml`) runs every hour. It pulls current and upcoming mainboard
  IPOs from NSE (dates, price band, lot size) into `site/ipos.json`, then republishes the site
  on GitHub Pages. You can also run it straight away from **Actions → Update IPOs and publish site → Run workflow**.
- **Apply tab:** pick the IPO, then click **sHNI**, **bHNI** or **None** for each account. Lots
  default to the category minimum at the upper price band:
  - sHNI minimum = the fewest lots above ₹2,00,000 (maximum ₹10,00,000)
  - bHNI minimum = the fewest lots above ₹10,00,000

  You can change the lots for an account within the category limits.
- **Reports tab** has four views. Filter by date, IPO, account or category (sHNI, bHNI or None):
  - **By IPO:** for each IPO, how many accounts applied, with sHNI, bHNI and None counts, lots, shares and
    amount blocked, plus the account list for each IPO.
  - **By account:** for each account, how many IPOs it applied in (sHNI, bHNI, None), its hit rate and amount
    blocked, plus that account's full IPO history.
  - **Matrix:** accounts × IPOs grid (S / B / –) with totals for each row and column.
  - **All rows:** every IPO × account pair, including None.

  Click any IPO or account name to see only that IPO or account. **Download Excel** gives five sheets you can filter
  and use in pivot tables: Overview, IPO-wise, Account-wise, Matrix and All rows. **Download PDF** gives the same
  summaries, the matrix, and the account list for each IPO.
- **IPOs tab:** lists every IPO received from NSE. You only add one by hand if it's missing. Your edits stay even when the NSE list updates.
- **Accounts tab:** the 24 account holders are pre-filled. Rename them, add PAN and notes, or add more.

## Where your data is kept

Accounts, PAN numbers and applications are saved **in your browser** on the device you use. They
are never uploaded to GitHub. The app keeps your history from now on and asks the browser not to clear it. A reminder appears when you have new entries that aren't backed up. Use **Download backup** when it does. To use another computer or browser,
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
