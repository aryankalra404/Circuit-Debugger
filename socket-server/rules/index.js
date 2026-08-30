const ledReversed = require('./ledReversed');
const missingGroundPath = require('./missingGroundPath');
const missingSeriesResistor = require('./missingSeriesResistor');
const resistorSanity = require('./resistorSanity');

const rules = [ledReversed, missingGroundPath, missingSeriesResistor, resistorSanity];

function diagnoseCircuit(circuit) {
  if (!circuit || typeof circuit !== 'object') return { ok: false, message: 'Circuit data is missing or invalid.' };
  for (const rule of rules) {
    const message = rule(circuit);
    if (message) return { ok: false, message };
  }
  return { ok: true, message: 'Circuit looks good: LED path is complete, protected, and polarity is correct.' };
}

module.exports = { diagnoseCircuit };
