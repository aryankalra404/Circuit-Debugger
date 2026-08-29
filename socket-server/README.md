# CircuitDoctor Socket.IO bridge

Minimal in-memory bridge for the Quest/Unity `QuestCircuitBridge.cs` event interface.

## Run

Requires Node.js 18+.

```bash
cd socket-server
npm install
npm start
```

The server listens on `http://0.0.0.0:3001`. Override this with `PORT=3002 npm start`.
For a Quest on the same Wi-Fi, set its configurable URL to your laptop's LAN address, such as `http://192.168.1.5:3001` (not `localhost`). Allow incoming connections through the laptop firewall if prompted.

## Standalone test

With the server running in one terminal:

```bash
npm run test:client
```

For the GND-path regression test (using the same `PinPoint.pinId` shape sent
by `QuestCircuitBridge.cs`), run `npm run test:rules`.

Expected output includes:

```text
circuit:result { ok: true, message: 'Circuit looks good: LED path is complete and polarity is correct.' }
simulation:led { componentId: 'led-1', on: true }
```

To point the test at another machine: `SOCKET_URL=http://192.168.1.5:3001 npm run test:client`.

## Events

Client → server:

- `session:join` — `{ sessionId }`
- `circuit:update` — `{ sessionId, circuit: { components, wires } }`

Server → all clients in that session:

- `circuit:result` — `{ ok, message }`
- `simulation:led` — `{ componentId, on }`

## Rules and extension point

Rules are one file each in `rules/` and return a fault message or `null`. `rules/index.js` runs them in order, so this is the only file you need to replace later when inserting Reka/RAG diagnosis behind the same Socket.IO events.

Current checks cover reversed LED polarity, a missing LED-to-GND path, a missing power path, and basic resistor values when a future `value` field is supplied. A resistor is optional for the current direct-LED AR demo. Session state stays in memory and is intentionally reset whenever the server restarts.
