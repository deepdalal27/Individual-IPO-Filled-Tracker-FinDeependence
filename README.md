# IPO Filled Tracker – sHNI / bHNI (Individual accounts)

A small web app to track IPO applications filed from multiple individual accounts
(24 by default) in **sHNI** and **bHNI** categories, with IPO-wise reports you can
download as **Excel** and **PDF**.

## What it does

- **Auto IPO calendar** – every few hours the server pulls current and upcoming
  mainboard IPOs from NSE's public IPO pages, including open/close dates,
  price band and lot size. New IPOs appear on their own, and price band and lot size
  fill in once NSE publishes them.
- **One-click entry** – open the *Apply* tab, pick the IPO, and
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
- **Accounts** – the 24 account holders come pre-filled; rename them, add PAN and notes, deactivate or add more.

## Run it on your own computer

1. Install **Node.js** (LTS version) from https://nodejs.org (one-time).
2. Download this repository (green **Code** button → **Download ZIP**) and unzip it.
3. Start the app by double-clicking the start file for your computer:
   - **Windows:** `start-windows.bat`
   - **Mac:** `start-mac.command` (the first time, right-click → **Open**)

   The first start installs what the app needs (about a minute). After that it opens
   http://localhost:3000 in your browser.
4. Keep the black window open while you use the app. Close it to stop the app.

Your data is saved in the `data` folder next to the app, so it's still there the next
time you start. Copy that folder somewhere safe now and then as a backup.

Or start it from a terminal:

```bash
npm install
```

```bash
npm start
```

### Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `APP_PASSWORD` | _(none)_ | Optional password for the app (only needed if you put it online) |
| `DATA_DIR` | `./data` | Where `db.json` is stored. Back this folder up. |
| `SYNC_INTERVAL_HOURS` | `3` | How often to pull IPOs from NSE |
| `INCLUDE_SME` | `0` | Set `1` to also import SME IPOs |
| `DISABLE_SYNC` | `0` | Set `1` to turn off auto-sync |

### Notes

- No password is set by default; the app runs only on your own computer.
- If the IPOs tab shows the last sync as "failed", NSE couldn't be reached. Add that
  IPO by hand with **+ Add IPO manually**.

## Tests

```bash
npm test
```
