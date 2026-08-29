const ledReversed = require('./ledReversed');
const missingGroundPath = require('./missingGroundPath');
const resistorSanity = require('./resistorSanity');

const rules = [ledReversed, missingGroundPath, resistorSanity];

function diagnoseCircuit(circuit) {
  if (!circuit || typeof circuit !== 'object') return { ok: false, message: 'Circuit data is missing or invalid.' };
  for (const rule of rules) {
    const message = rule(circuit);
    if (message) return { ok: false, message };
  }
  return { ok: true, message: 'Circuit looks good: LED path is complete and polarity is correct.' };
}

module.exports = { diagnoseCircuit };
