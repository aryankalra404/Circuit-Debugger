const http = require('http');
const { Server } = require('socket.io');
const { diagnoseCircuit } = require('./rules');

const PORT = Number(process.env.PORT || 3001);
const sessions = new Map();

const httpServer = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ service: 'CircuitDoctor Socket.IO bridge', status: 'ok' }));
});

const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

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

    sessions.set(sessionId, { circuit: payload.circuit, updatedAt: new Date().toISOString() });
    const componentCount = Array.isArray(payload.circuit.components) ? payload.circuit.components.length : 0;
    const wireCount = Array.isArray(payload.circuit.wires) ? payload.circuit.wires.length : 0;
    console.log(`[circuit] ${sessionId} (${socket.id}): ${componentCount} components, ${wireCount} wires`);

    const result = diagnoseCircuit(payload.circuit);
    console.log(`[result] ${sessionId}: ${result.ok ? 'OK' : 'FAULT'} — ${result.message}`);

    // Broadcast to the room so a dashboard/client paired to the same session also receives it.
    io.to(sessionId).emit('circuit:result', result);
    const leds = Array.isArray(payload.circuit.components)
      ? payload.circuit.components.filter((component) => component.type === 'led')
      : [];
    for (const led of leds) {
      io.to(sessionId).emit('simulation:led', { componentId: led.id, on: result.ok });
    }
  });

  socket.on('disconnect', (reason) => console.log(`[socket] disconnected ${socket.id} (${reason})`));
});

httpServer.listen(PORT, () => console.log(`CircuitDoctor Socket.IO bridge listening on http://0.0.0.0:${PORT}`));
