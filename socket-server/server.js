const http = require('http');
require('dotenv').config();
const { Server } = require('socket.io');
// Kept as a deterministic offline fallback if the LLM is unavailable.
const { diagnoseCircuit } = require('./rules');
const { diagnoseAndVerify } = require('./reasoning/diagnoseAndVerify');

const PORT = Number(process.env.PORT || 3001);
const REASONING_DEBOUNCE_MS = 1200;
const sessions = new Map();

function createCircuitUpdateDebouncer({ delayMs = REASONING_DEBOUNCE_MS, onFire, log = console.log }) {
  const timers = new Map();

  return {
    schedule(sessionId, revision) {
      const wasReset = timers.has(sessionId);
      if (wasReset) clearTimeout(timers.get(sessionId));
      log(`[debounce] ${sessionId}: ${wasReset ? 'reset' : 'started'}; waiting ${delayMs}ms before reasoning`);
      timers.set(sessionId, setTimeout(() => {
        timers.delete(sessionId);
        log(`[debounce] ${sessionId}: fired for revision ${revision}; calling reasoning`);
        Promise.resolve(onFire(sessionId, revision)).catch((error) => {
          console.error(`[debounce] ${sessionId}: processing failed: ${error.message}`);
        });
      }, delayMs));
    },
    cancel(sessionId) {
      if (!timers.has(sessionId)) return;
      clearTimeout(timers.get(sessionId));
      timers.delete(sessionId);
    }
  };
}

const httpServer = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ service: 'CircuitDoctor Socket.IO bridge', status: 'ok' }));
});

const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

async function runReasoningForSession(sessionId, revision) {
  const session = sessions.get(sessionId);
  // A newer update is already waiting, so never reason about an old snapshot.
  if (!session || session.revision !== revision) {
    console.log(`[result] ${sessionId}: skipped stale revision ${revision}`);
    return;
  }

  const circuit = session.circuit;
  const intent = session.intent || '';
  let result;
  try {
    const pipeline = await diagnoseAndVerify(circuit, {
      intent,
      onStage(stage, details) {
        console.log(`[pipeline] ${sessionId} ${stage}: ${JSON.stringify(details)}`);
      }
    });
    result = pipeline.result;
  } catch (error) {
    console.warn(`[pipeline] failed for ${sessionId}; using rule fallback: ${error.message}`);
    const fallback = diagnoseCircuit(circuit);
    result = {
      ...fallback,
      confidence: null,
      groundedOn: null,
      suspectedComponent: null,
      suspectedComponents: [],
      faults: []
    };
  }

  // Do not publish a slow response for an older AR circuit snapshot.
  if (sessions.get(sessionId)?.revision !== revision) {
    console.log(`[result] ${sessionId}: skipped stale revision ${revision}`);
    return;
  }
  console.log(`[result] ${sessionId}: ${result.ok ? 'OK' : 'FAULT'} (${result.confidence || 'not-applicable'}) — ${result.message}`);

  io.to(sessionId).emit('circuit:result', result);
  // Diagnosis and LED simulation are deliberately independent. A fault must
  // never turn an AR LED off; emit simulation:led only from an explicit
  // simulation source, not from a circuit:result verdict.
}

const reasoningDebouncer = createCircuitUpdateDebouncer({ onFire: runReasoningForSession });

function cleanSessionId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on('session:join', (payload = {}) => {
    const sessionId = cleanSessionId(payload.sessionId);
    if (!sessionId) {
      socket.emit('circuit:result', { ok: false, message: 'A valid sessionId is required.' });
      return;
    }

    if (socket.data.sessionId && socket.data.sessionId !== sessionId) {
      socket.leave(socket.data.sessionId);
    }
    socket.data.sessionId = sessionId;
    socket.join(sessionId);
    if (!sessions.has(sessionId)) sessions.set(sessionId, { circuit: null, updatedAt: null });
    console.log(`[session] ${socket.id} joined ${sessionId}`);
  });

  socket.on('circuit:update', (payload = {}) => {
    const sessionId = cleanSessionId(payload.sessionId);
    if (!sessionId || !payload.circuit || typeof payload.circuit !== 'object') {
      socket.emit('circuit:result', { ok: false, message: 'circuit:update needs a sessionId and circuit JSON.' });
      return;
    }

    // Joining is optional for convenience, but a sender is always put in its session room.
    if (socket.data.sessionId !== sessionId) {
      if (socket.data.sessionId) socket.leave(socket.data.sessionId);
      socket.data.sessionId = sessionId;
      socket.join(sessionId);
    }

    const previous = sessions.get(sessionId);
    const revision = (previous?.revision || 0) + 1;
    sessions.set(sessionId, { circuit: payload.circuit, updatedAt: new Date().toISOString(), revision, intent: previous?.intent || '' });
    const componentCount = Array.isArray(payload.circuit.components) ? payload.circuit.components.length : 0;
    const wireCount = Array.isArray(payload.circuit.wires) ? payload.circuit.wires.length : 0;
    console.log(`[circuit] ${sessionId} (${socket.id}): ${componentCount} components, ${wireCount} wires`);
    // Relay the exact structural snapshot to every client in this session so
    // the dashboard can mirror the Quest circuit while it is being built.
    io.to(sessionId).emit('circuit:update', { sessionId, circuit: payload.circuit });
    console.log(`[circuit] emitted circuit:update to ${sessionId}: ${componentCount} components, ${wireCount} wires`);
    reasoningDebouncer.schedule(sessionId, revision);
  });

  socket.on('circuit:intent', (payload = {}) => {
    const sessionId = cleanSessionId(payload.sessionId);
    if (!sessionId) return;
    const intent = typeof payload.intent === 'string' ? payload.intent.trim() : '';
    const session = sessions.get(sessionId);
    if (session) {
      session.intent = intent;
    } else {
      sessions.set(sessionId, { circuit: null, updatedAt: null, intent });
    }
    console.log(`[intent] ${sessionId} (${socket.id}): ${intent ? `"${intent}"` : '(cleared)'}`);
  });

  socket.on('disconnect', (reason) => console.log(`[socket] disconnected ${socket.id} (${reason})`));
});

if (require.main === module) {
  httpServer.listen(PORT, () => console.log(`CircuitDoctor Socket.IO bridge listening on http://0.0.0.0:${PORT}`));
}

module.exports = { createCircuitUpdateDebouncer, REASONING_DEBOUNCE_MS };
