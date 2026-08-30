const { retrieve } = require('../rag/retrieve');
const { getClient, MODEL } = require('../reasoning/openaiCircuitReasoner');

const MAX_HISTORY_MESSAGES = 10;

function summarizeCircuit(circuit) {
  const components = Array.isArray(circuit?.components) ? circuit.components : [];
  const wires = Array.isArray(circuit?.wires) ? circuit.wires : [];
  return {
    components: components.map(({ id, type }) => ({ id, type })),
    wires
  };
}

function buildRetrievalQuery(message, circuit) {
  const componentTerms = (circuit?.components || []).map((component) => `${component.id} ${component.type}`).join(' ');
  return `${componentTerms} ${message}`.trim();
}

function fallbackResponse(session) {
  const faultComponent = session.latestResult?.suspectedComponent;
  if (faultComponent) return `I can see a current issue involving ${faultComponent}, but I could not retrieve enough datasheet evidence to add a grounded explanation. Please check the displayed diagnosis and wiring.`;
  return 'I do not have enough grounded component reference information to answer that confidently. Please ask about a connected LED, resistor, or PIR component.';
}

async function answerChatMessage({ session, message, retrieveChunks = retrieve, client = getClient() }) {
  const circuit = session.circuit || { components: [], wires: [] };
  const circuitSummary = summarizeCircuit(circuit);
  const diagnosis = session.latestResult || null;
  const query = buildRetrievalQuery(message, circuit);
  let snippets = [];
  try {
    snippets = await retrieveChunks(query, 2);
  } catch (error) {
    console.warn(`[chat] RAG retrieval failed: ${error.message}`);
  }

  if (snippets.length === 0 && !diagnosis?.suspectedComponent) return fallbackResponse(session);

  const evidence = snippets.map(({ source, heading, text }) => ({ source, heading, text }));
  const history = Array.isArray(session.chatHistory) ? session.chatHistory.slice(-MAX_HISTORY_MESSAGES) : [];
  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 260,
    messages: [
      {
        role: 'system',
        content: `You are CircuitDoctor, a concise circuit assistant. Answer only using the live circuit summary, latest diagnosis, and retrieved datasheet excerpts supplied below. Do not invent values, missing connections, or component behavior. If the evidence cannot answer the question, say so clearly. Refer to exact component IDs when relevant.\n\nLive circuit summary:\n${JSON.stringify(circuitSummary)}\n\nLatest diagnosis:\n${JSON.stringify(diagnosis)}\n\nRetrieved datasheet excerpts:\n${JSON.stringify(evidence)}`
      },
      ...history,
      { role: 'user', content: message }
    ]
  });
  const answer = response.choices[0]?.message?.content?.trim();
  if (!answer) throw new Error('OpenAI returned no chat response.');
  return answer;
}

function appendChatTurn(session, role, content) {
  if (!Array.isArray(session.chatHistory)) session.chatHistory = [];
  session.chatHistory.push({ role, content });
  session.chatHistory = session.chatHistory.slice(-MAX_HISTORY_MESSAGES);
}

module.exports = { answerChatMessage, appendChatTurn, buildRetrievalQuery, summarizeCircuit, fallbackResponse, MAX_HISTORY_MESSAGES };
