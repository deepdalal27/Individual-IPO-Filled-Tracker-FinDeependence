// Tiny JSON-file store. Data volume is small (24 accounts, a few IPOs a
// month), so a single file written atomically is enough.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_ACCOUNTS = Number(process.env.DEFAULT_ACCOUNTS || 24);

let state = null;

function id() {
  return crypto.randomBytes(6).toString('hex');
}

function load() {
  if (state) return state;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } else {
    state = { accounts: [], ipos: [], applications: [], meta: {} };
    for (let i = 1; i <= DEFAULT_ACCOUNTS; i++) {
      state.accounts.push({ id: id(), name: `Account ${i}`, pan: '', notes: '', active: true, order: i });
    }
    save();
  }
  state.meta = state.meta || {};
  return state;
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

module.exports = { load, save, id, FILE };
