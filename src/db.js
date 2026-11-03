// Tiny JSON-file store. Data volume is small (24 accounts, a few IPOs a
// month), so a single file written atomically is enough.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
// Account holders created on first start (editable in the Accounts tab).
const DEFAULT_NAMES = [
  'Hansaben B Shah',
  'Manishkumar Kumarpal Vora',
  'Jignesh Kumarpal Shah',
  'Kumarpal C Vora (Huf)',
  'Komal Manish Vora',
  'Kumarpal Chandulal Vora',
  'Manish K Vora (Huf)',
  'Dev M Vora',
  'Nitinbhai C Shah',
  'Jigna Jignesh Shah',
  'Ansh Zaveri',
  'Mahesh Dalpatlal Doshi',
  'Dhwet Jignesh Shah',
  'Alkaben Maheshbhai Doshi',
  'Preritaben Nitinbhai Shah',
  'Narayan Meena',
  'Parshanath LLP',
  'Arth Maheshbhai Doshi',
  'Jignesh Kumarpal Shah (Huf)',
  'Vasantiben Kumarpal Vora',
  'Jayshreeben Sheth',
  'Bipin Vaghela',
  'Tulasi Narayan Meena',
  'Dodiya Hiteshbhai',
];


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
    DEFAULT_NAMES.forEach((name, i) => {
      state.accounts.push({ id: id(), name, pan: '', notes: '', active: true, order: i + 1 });
    });
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
