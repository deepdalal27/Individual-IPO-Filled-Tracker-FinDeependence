# IPO Filled Tracker – sHNI / bHNI (Individual accounts)

A small web app to track IPO applications filed from multiple individual accounts
(24 by default) in **sHNI** and **bHNI** categories, with IPO-wise reports you can
download as **Excel** and **PDF**.

## What it does

- **Auto IPO calendar** – every few hours the server pulls current and upcoming
  mainboard IPOs from NSE's public IPO pages, including open/close dates,
  price band and lot size. New IPOs appear on their own, and price band and lot size
  fill in once NSE publishes them.
- **One-click entry for the operator** – open the *Apply* tab, pick the IPO, and
  click **sHNI** / **bHNI** / **None** next to each account. Lots are set
  automatically to the category minimum at the upper price band:
  - sHNI min lots = smallest number of lots above ₹2,00,000 (max ≤ ₹10,00,000)
  - bHNI min lots = smallest number of lots above ₹10,00,000

  Lots can be changed per account if needed (they're checked against the category limits).
  Shares and amount blocked are calculated live.
- **Reports** – IPO-wise summary (sHNI/bHNI account count, total lots, total
  shares, amount blocked at upper price band) and an account-wise breakdown.
  Filter by date range, IPO or category, then **Download Excel** (2 sheets: IPO Summary and
  Account Detail) or **Download PDF**.
- **Manual IPOs** – add or edit any IPO by hand (e.g. if NSE is unreachable, or for an SME
  issue). Edited IPOs are not overwritten by the auto-sync.
- **Accounts** – rename the 24 accounts, add PAN and notes, deactivate or add more.

## Run it

```bash
npm install
```

```bash
APP_PASSWORD=choose-a-password npm start
```

Open http://localhost:3000. When `APP_PASSWORD` is set, the browser asks for a
login: any username works, and the password is `APP_PASSWORD`. Share the URL and password with your colleague.

### Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `APP_PASSWORD` | _(none)_ | Password for the app (strongly recommended when hosted) |
| `DATA_DIR` | `./data` | Where `db.json` is stored. Back this folder up. |
| `SYNC_INTERVAL_HOURS` | `3` | How often to pull IPOs from NSE |
| `INCLUDE_SME` | `0` | Set `1` to also import SME IPOs |
| `DEFAULT_ACCOUNTS` | `24` | Number of accounts created on first start |
| `DISABLE_SYNC` | `0` | Set `1` to turn off auto-sync |

### Hosting

Any Node 20+ host works (a VPS, Railway, Render, Fly.io and so on). The data lives in one
JSON file, so give the app a **persistent disk** and point `DATA_DIR` at it.
Without one, the data is lost on every redeploy. NSE sometimes blocks
data-centre IPs. If auto-sync shows "failed" in the IPOs tab, add IPOs manually there.

## Tests

```bash
npm test
```
