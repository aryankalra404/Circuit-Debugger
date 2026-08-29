const OpenAI = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 8000);
const NOTHING_WIRED_YET = {
  hasFault: false,
  suspectedComponent: null,
  suspectedIssue: null,
  reasoning: 'Nothing wired yet.'
};

const circuitDiagnosisSchema = {
  name: 'circuit_diagnosis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      hasFault: { type: 'boolean' },
      suspectedComponent: { type: ['string', 'null'] },
      suspectedIssue: { type: ['string', 'null'] },
      reasoning: { type: 'string' }
    },
    required: ['hasFault', 'suspectedComponent', 'suspectedIssue', 'reasoning']
  }
};

const systemPrompt = `You are CircuitDoctor's strict circuit-fault reasoning engine. Analyze only the supplied circuit JSON. Component fields name physical terminal pin IDs. Each wire {from,to} is an undirected physical connection. Do not invent components, wires, electrical nets, or faults.

Pin conventions for this Unity demo:
- LED terminal IDs follow LED1_L1/LED2_L1/LED3_L1 for long-leg anodes and LED1_L2/LED2_L2/LED3_L2 for short-leg cathodes.
- Resistor terminal IDs follow RES1_R1/RES1_R2, RES2_R1/RES2_R2, and RES3_R1/RES3_R2. Component IDs (led-1 through led-3, resistor-1 through resistor-3) identify each physical part.
- PIR terminals are PIR_VCC, PIR_GND, and PIR_SIGNAL.
- Arduino supply/role labels include GND, VIN, 5V, 3V3, AREF, RESET, IOREF, and digital pins D1, D2, etc. For this demo, a D-number pin may be the source for an LED or the signal destination for a PIR.

Required decision protocol:
1. Build a connectivity trace from the actual wire endpoints, then inspect each component terminal against that trace. The payload contains only components with at least one connected terminal; do not infer that omitted components are faulty or incomplete.
2. For an LED, verify a concrete series path: source (D-number, VIN, 5V, or 3V3) -> matching resistor endpoint -> other resistor endpoint -> that LED's *_L1 anode, plus that LED's *_L2 cathode -> GND. Wire direction does not matter. This exact path, with no contradictory connection of *_L1 to GND or *_L2 to source, is valid and MUST produce hasFault false. Do not call it faulty merely because it uses a D-number source.
3. The PIR in this demo is an HC-SR501: verify PIR_VCC -> 5V specifically (3V3/3.3V is a fault), PIR_GND -> GND, and PIR_SIGNAL -> a non-supply, non-ground signal destination such as a D-number input. Swapped VCC/GND, signal tied to a supply/ground, or an unconnected required terminal is a fault.
4. For a resistor, flag only an explicit issue such as disconnection, bypass, invalid value, or absence from an LED's required series path.
5. Set hasFault true ONLY when a specific, checkable condition above is violated. Do not report a vague concern, missing optional component, or an imagined issue. If no listed violation is proven by the wires, set hasFault false.

The reasoning field must contain a compact step-by-step trace using the actual pin IDs, followed by the verdict. Never contradict the trace: if the trace proves a valid series path and no explicit violation, hasFault must be false.`;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  // Disable SDK retries: a live AR update must fall back promptly instead of
  // silently extending beyond its latency budget.
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
}

function validateDiagnosis(value) {
  if (!value || typeof value !== 'object' || typeof value.hasFault !== 'boolean' || typeof value.reasoning !== 'string') {
    throw new Error('OpenAI returned an invalid diagnosis shape.');
  }
  for (const key of ['suspectedComponent', 'suspectedIssue']) {
    if (value[key] !== null && typeof value[key] !== 'string') {
      throw new Error(`OpenAI returned an invalid ${key}.`);
    }
  }
  return value;
}

function getComponentPinIds(component) {
  if (!component || typeof component !== 'object') return [];
  // Component metadata such as id, type, and an optional resistor value are
  // not physical terminals. All other non-empty string properties are pin IDs.
  return Object.entries(component)
    .filter(([key, value]) => !['id', 'type', 'value'].includes(key) && typeof value === 'string' && value.trim())
    .map(([, value]) => value);
}

/**
 * Removes parts the student has not started. Filtering here (rather than
 * trusting an LLM prompt) makes untouched components impossible to flag.
 */
function prepareCircuitForReasoning(circuit) {
  const wires = Array.isArray(circuit?.wires) ? circuit.wires : [];
  if (wires.length === 0) return { circuit: { components: [], wires: [] }, diagnosis: NOTHING_WIRED_YET };

  const connectedPinIds = new Set();
  for (const wire of wires) {
    if (typeof wire?.from === 'string' && wire.from.trim()) connectedPinIds.add(wire.from);
    if (typeof wire?.to === 'string' && wire.to.trim()) connectedPinIds.add(wire.to);
  }

  const components = Array.isArray(circuit?.components) ? circuit.components : [];
  return {
    circuit: {
      components: components.filter((component) => getComponentPinIds(component).some((pinId) => connectedPinIds.has(pinId))),
      wires
    },
    diagnosis: null
  };
}

async function reasonAboutCircuit(circuit) {
  const prepared = prepareCircuitForReasoning(circuit);
  if (prepared.diagnosis) return prepared.diagnosis;

  const componentCount = prepared.circuit.components.length;
  const wireCount = prepared.circuit.wires.length;
  console.log(`[llm] sending ${componentCount} components and ${wireCount} wires to ${MODEL} (timeout ${TIMEOUT_MS}ms)`);

  const response = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 350,
    response_format: { type: 'json_schema', json_schema: circuitDiagnosisSchema },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this circuit JSON:\n${JSON.stringify(prepared.circuit)}` }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no diagnosis content.');
  const diagnosis = validateDiagnosis(JSON.parse(content));
  console.log(`[llm] received: ${JSON.stringify(diagnosis)}`);
  return diagnosis;
}

function toCircuitResult(diagnosis) {
  if (!diagnosis.hasFault) {
    return { ok: true, message: diagnosis.reasoning || 'LLM found no visible circuit fault.' };
  }
  const prefix = diagnosis.suspectedComponent ? `Suspected ${diagnosis.suspectedComponent}: ` : '';
  return { ok: false, message: `${prefix}${diagnosis.suspectedIssue || diagnosis.reasoning}` };
}

module.exports = { reasonAboutCircuit, toCircuitResult, prepareCircuitForReasoning, NOTHING_WIRED_YET };
