const OpenAI = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 8000);
const verificationSchema = {
  name: 'grounded_circuit_verification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['confirmed', 'corrected', 'uncertain'] },
      finalMessage: { type: 'string' },
      groundedOn: { type: 'string' }
    },
    required: ['verdict', 'finalMessage', 'groundedOn']
  }
};

const systemPrompt = `You are CircuitDoctor's verification step. Check the proposed circuit-fault diagnosis only against the supplied datasheet excerpts.

Return confirmed when the excerpt clearly supports the diagnosis. Return corrected only when the excerpt contradicts the diagnosis; finalMessage must state the corrected understanding. Do not use corrected merely to reword, add detail to, or clarify an already-supported diagnosis. Return uncertain when the excerpts do not clearly support or refute it; finalMessage must say it is unconfirmed and advise a double-check. Do not invent electrical facts, component specs, or source citations.

groundedOn must identify the supplied source filename and section heading that most directly supports your verdict. Keep finalMessage concise, plain English, and grounded in that excerpt.`;

function validateVerification(value) {
  if (!value || !['confirmed', 'corrected', 'uncertain'].includes(value.verdict)) {
    throw new Error('OpenAI returned an invalid verification verdict.');
  }
  for (const key of ['finalMessage', 'groundedOn']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) {
      throw new Error(`OpenAI returned an invalid verification ${key}.`);
    }
  }
  return value;
}

async function verifyDiagnosis(diagnosis, chunks) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('At least one retrieved datasheet chunk is required.');

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const evidence = chunks.map(({ source, heading, text }) => ({ source, heading, text }));
  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 250,
    response_format: { type: 'json_schema', json_schema: verificationSchema },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Proposed diagnosis:\n${JSON.stringify(diagnosis)}\n\nDatasheet excerpts:\n${JSON.stringify(evidence)}`
      }
    ]
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no verification content.');
  return validateVerification(JSON.parse(content));
}

module.exports = { verifyDiagnosis, validateVerification };
