const { reasonAboutCircuit, toCircuitResult } = require('./openaiCircuitReasoner');
const { retrieve } = require('../rag/retrieve');
const { verifyDiagnosis } = require('./verifyDiagnosis');

function report(onStage, stage, details) {
  if (onStage) onStage(stage, details);
}

function buildRetrievalQuery(diagnosis) {
  return `${diagnosis.suspectedComponent || 'circuit component'}: ${diagnosis.suspectedIssue || diagnosis.reasoning}`;
}

/** Runs the complete fault-only grounding pipeline. Throws so server.js can use its rules fallback. */
async function diagnoseAndVerify(circuit, options = {}) {
  const reason = options.reasonAboutCircuit || reasonAboutCircuit;
  const retrieveChunks = options.retrieve || retrieve;
  const verify = options.verifyDiagnosis || verifyDiagnosis;
  const onStage = options.onStage;

  const diagnosis = await reason(circuit);
  report(onStage, 'reasoning:received', diagnosis);
  if (!diagnosis.hasFault) {
    return { result: { ...toCircuitResult(diagnosis), confidence: null, groundedOn: null }, diagnosis, chunks: [], verification: null };
  }

  const query = buildRetrievalQuery(diagnosis);
  report(onStage, 'rag:query', { query });
  const chunks = await retrieveChunks(query, 2);
  report(onStage, 'rag:retrieved', chunks.map(({ source, heading, score }) => ({ source, heading, score })));

  report(onStage, 'verification:sent', { diagnosis, chunkCount: chunks.length });
  const verification = await verify(diagnosis, chunks);
  report(onStage, 'verification:received', verification);

  // An uncertain result still needs student attention, so it remains a false
  // `ok` result but the verifier's message makes its uncertainty explicit.
  return {
    result: {
      ok: false,
      message: verification.finalMessage,
      confidence: verification.verdict,
      groundedOn: verification.groundedOn
    },
    diagnosis,
    chunks,
    verification
  };
}

module.exports = { diagnoseAndVerify, buildRetrievalQuery };
