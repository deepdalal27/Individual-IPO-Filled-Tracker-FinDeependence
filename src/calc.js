// SEBI investor-category limits for mainboard IPOs (amount at upper price band).
//   Retail : up to Rs 2,00,000
//   sHNI   : above Rs 2,00,000 and up to Rs 10,00,000
//   bHNI   : above Rs 10,00,000
const RETAIL_LIMIT = 200000;
const SHNI_LIMIT = 1000000;

const CATEGORIES = ['SHNI', 'BHNI'];

function lotAmount(ipo) {
  const lot = Number(ipo.lotSize) || 0;
  const price = Number(ipo.priceHigh) || 0;
  return lot * price;
}

// Minimum / maximum lots allowed for a category. Returns null if the IPO
// does not have price band + lot size yet.
function lotRange(ipo, category) {
  const amt = lotAmount(ipo);
  if (!amt) return null;
  if (category === 'SHNI') {
    // SME: retail is fixed at 2 lots, so any HNI bid needs at least 3 lots.
    const min = Math.max(Math.floor(RETAIL_LIMIT / amt) + 1, ipo.type === 'SME' ? 3 : 1);
    const max = Math.floor(SHNI_LIMIT / amt);
    if (max < min) return null; // one lot already exceeds Rs 10 lakh
    return { min, max };
  }
  if (category === 'BHNI') {
    return { min: Math.max(Math.floor(SHNI_LIMIT / amt) + 1, ipo.type === 'SME' ? 3 : 1), max: null };
  }
  return null;
}

// Resolve the lots for an application: manual override if valid,
// otherwise the category minimum (the usual way sHNI/bHNI is applied).
function computeApplication(ipo, app) {
  const range = lotRange(ipo, app.category);
  if (!range) {
    return { lots: null, shares: null, amount: null, auto: true, range: null };
  }
  let lots = range.min;
  let auto = true;
  const override = Number(app.lots);
  if (Number.isInteger(override) && override >= range.min && (range.max == null || override <= range.max)) {
    lots = override;
    auto = override === range.min;
  }
  const shares = lots * Number(ipo.lotSize);
  return { lots, shares, amount: shares * Number(ipo.priceHigh), auto, range };
}

// Date in India (IST, UTC+5:30) as YYYY-MM-DD.
function istDate(d = new Date()) {
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

function ipoStatus(ipo, today = new Date()) {
  const t = istDate(today);
  if (ipo.openDate && t < ipo.openDate) return 'Upcoming';
  if (ipo.closeDate && t > ipo.closeDate) return 'Closed';
  if (ipo.openDate) return 'Open';
  return 'Upcoming';
}

module.exports = { RETAIL_LIMIT, SHNI_LIMIT, CATEGORIES, lotAmount, lotRange, computeApplication, ipoStatus, istDate };
