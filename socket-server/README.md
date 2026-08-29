# CircuitDoctor Socket.IO bridge

Minimal in-memory bridge for the Quest/Unity `QuestCircuitBridge.cs` event interface.

## Run

Requires Node.js 18+.

```bash
cd socket-server
npm install
cp .env.example .env
npm start
```

Set `OPENAI_API_KEY` in `socket-server/.env` before starting. The server uses
`gpt-4o-mini` by default: it is a fast, lower-cost choice for small structured
circuit payloads in a live demo. Set `OPENAI_MODEL` or `OPENAI_TIMEOUT_MS` in
`.env` to override the model or the default 7-second timeout. Never commit
your `.env` file.

The server listens on `http://0.0.0.0:3001`. Override this with `PORT=3002 npm start`.
For a Quest on the same Wi-Fi, set its configurable URL to your laptop's LAN address, such as `http://192.168.1.5:3001` (not `localhost`). Allow incoming connections through the laptop firewall if prompted.

## Standalone test

With the server running in one terminal:

```bash
npm run test:client
```

For the GND-path regression test (using the same `PinPoint.pinId` shape sent
by `QuestCircuitBridge.cs`), run `npm run test:rules`.

To send three representative payloads directly through the LLM reasoning step
(correct LED circuit, reversed LED, and swapped PIR roles), run:

```bash
npm run test:reasoning
```

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

## LLM reasoning and fallback

Every `circuit:update` is analyzed by `reasoning/openaiCircuitReasoner.js`.
It requests strict JSON from OpenAI with this shape:

```json
{
  "hasFault": true,
  "suspectedComponent": "led-1",
  "suspectedIssue": "LED polarity is reversed.",
  "reasoning": "The anode is connected toward GND while the cathode is on the source side."
}
```

That output is mapped back to the existing `circuit:result` contract, so Unity
and the dashboard need no changes. If the API key is missing, OpenAI errors, or
the request exceeds the timeout, the server logs `[llm] failed ... using rule
fallback` and runs the old deterministic logic instead.

## Rules (fallback)

Rules are one file each in `rules/` and return a fault message or `null`.
`rules/index.js` is no longer the primary diagnosis path; it is deliberately
kept intact as the offline fallback.

Current checks cover reversed LED polarity, a missing LED-to-GND path, a missing power path, and basic resistor values when a future `value` field is supplied. A resistor is optional for the current direct-LED AR demo. Session state stays in memory and is intentionally reset whenever the server restarts.
