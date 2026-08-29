const { buildGraph, isGround, powerNodes, reachable, terminalNode } = require('./circuitGraph');

module.exports = function missingGroundPath(circuit) {
  const components = Array.isArray(circuit.components) ? circuit.components : [];
  const leds = components.filter((component) => component.type === 'led');
  if (!leds.length) return 'No LED was found in the circuit.';

  const graph = buildGraph(circuit);
  const fromGround = reachable(graph, [...graph.keys()].filter(isGround));
  const fromPower = reachable(graph, powerNodes(graph));
  const resistors = components.filter((component) => component.type === 'resistor');
  const wires = Array.isArray(circuit.wires) ? circuit.wires : [];

  for (const led of leds) {
    const anode = terminalNode(led, 'anode');
    const cathode = terminalNode(led, 'cathode');
    // Terminal fields are useful labels, but do not on their own prove a
    // physical wire is present. Require the cathode port to be wired too.
    const cathodeIsWired = wires.some((wire) => wire && (wire.from === cathode || wire.to === cathode));
    if (!cathodeIsWired || !fromGround.has(cathode)) {
      return `LED ${led.id} has no continuous path from its cathode to GND. Check the ground wire.`;
    }
    if (!fromPower.has(anode)) {
      return `LED ${led.id} has no power-side path to its anode. Check the resistor and power-pin wiring.`;
    }
    const resistorInPath = resistors.some((resistor) => {
      const a = terminalNode(resistor, 'a');
      const b = terminalNode(resistor, 'b');
      // In the full graph a resistor conducts, so both terminals must belong
      // to the LED's powered network. This deliberately stays permissive for
      // live AR placement, where labels and explicit wire endpoints coexist.
      return fromPower.has(a) && fromPower.has(b);
    });
    if (!resistorInPath) return `LED ${led.id} is missing a resistor in its power path.`;
  }
  return null;
};
