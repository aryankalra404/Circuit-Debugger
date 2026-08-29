const assert = require('node:assert/strict');
const { diagnoseCircuit } = require('../rules');

// This matches QuestCircuitBridge.BuildCircuit(): component terminal fields
// hold PinPoint.pinId values and actual physical links are { from, to } wires.
const directLedToGround = {
  components: [
    { id: 'led-1', type: 'led', anode: 'LED_ANODE_PIN', cathode: 'LED_CATHODE_PIN' }
  ],
  wires: [
    { from: 'D13', to: 'LED_ANODE_PIN' },
    { from: 'LED_CATHODE_PIN', to: 'GND' }
  ]
};

const valid = diagnoseCircuit(directLedToGround);
assert.equal(valid.ok, true, valid.message);

const noGround = structuredClone(directLedToGround);
noGround.wires.pop();
const invalid = diagnoseCircuit(noGround);
assert.equal(invalid.ok, false);
assert.match(invalid.message, /cathode to GND/);

console.log('Rule regression checks passed.');
