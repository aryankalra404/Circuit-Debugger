require('dotenv').config();
const { reasonAboutCircuit } = require('../reasoning/openaiCircuitReasoner');

const cases = [
  {
    name: 'correct LED circuit',
    circuit: {
      components: [
        { id: 'led-1', type: 'led', anode: 'LED_A', cathode: 'LED_K' },
        { id: 'resistor-1', type: 'resistor', a: 'R_A', b: 'R_B', value: '220 ohm' }
      ],
      wires: [
        { from: 'D13', to: 'R_A' },
        { from: 'R_B', to: 'LED_A' },
        { from: 'LED_K', to: 'GND' }
      ]
    }
  },
  {
    name: 'reversed LED',
    circuit: {
      components: [
        { id: 'led-1', type: 'led', anode: 'LED_A', cathode: 'LED_K' },
        { id: 'resistor-1', type: 'resistor', a: 'R_A', b: 'R_B', value: '220 ohm' }
      ],
      wires: [
        { from: 'D13', to: 'R_A' },
        { from: 'R_B', to: 'LED_K' },
        { from: 'LED_A', to: 'GND' }
      ]
    }
  },
  {
    name: 'PIR roles swapped',
    circuit: {
      components: [
        { id: 'pir-1', type: 'pir', vcc: 'PIR_VCC', gnd: 'PIR_GND', out: 'PIR_OUT' }
      ],
      wires: [
        { from: 'PIR_VCC', to: 'GND' },
        { from: 'PIR_GND', to: '5V' },
        { from: 'PIR_OUT', to: '5V' }
      ]
    }
  }
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Set OPENAI_API_KEY in socket-server/.env before running this test.');
  }
  for (const testCase of cases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log(JSON.stringify(await reasonAboutCircuit(testCase.circuit), null, 2));
  }
}

main().catch((error) => {
  console.error('[test:reasoning] failed:', error.message);
  process.exitCode = 1;
});
