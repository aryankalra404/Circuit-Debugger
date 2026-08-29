const OpenAI = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 7000);

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

const systemPrompt = `You are CircuitDoctor's circuit-fault reasoning engine. Analyze only the provided circuit JSON. Components identify their terminal pin IDs; wires are the physical connections between pin IDs. Do not invent wires.

Expected behavior:
- LED: anode must be on the positive/source side, cathode toward GND; it needs a current-limiting resistor in series and a closed current path to GND.
- Resistor: should be in the intended series path, not bypassed or disconnected. If a value exists, it should be plausible for the indicated load.
- PIR sensor: VCC must connect to a positive supply, GND to ground, and OUT must connect to a meaningful signal/input destination rather than a supply rail or nowhere.
- For unknown component types, reason conservatively from their terminal names and the actual wiring.

Find any demonstrable or likely anomaly, including disconnected terminals, swapped roles, reversed polarity, missing return paths, shorts, bypasses, and invalid pin roles. A circuit without enough evidence for a correct operating path should be a fault. If the wiring is internally consistent and no anomaly is visible, return hasFault false. Keep the reasoning concise and plain English.`;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

async function reasonAboutCircuit(circuit) {
  const componentCount = Array.isArray(circuit.components) ? circuit.components.length : 0;
  const wireCount = Array.isArray(circuit.wires) ? circuit.wires.length : 0;
  console.log(`[llm] sending ${componentCount} components and ${wireCount} wires to ${MODEL} (timeout ${TIMEOUT_MS}ms)`);

  const response = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 350,
    response_format: { type: 'json_schema', json_schema: circuitDiagnosisSchema },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this circuit JSON:\n${JSON.stringify(circuit)}` }
    ]
  }, { signal: AbortSignal.timeout(TIMEOUT_MS) });

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

module.exports = { reasonAboutCircuit, toCircuitResult };
