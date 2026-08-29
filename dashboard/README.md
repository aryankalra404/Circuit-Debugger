# CircuitDoctor dashboard

Polished Next.js dashboard for the existing Socket.IO bridge. It joins the same `demo-room` as the Quest app, listens for `circuit:result` and `simulation:led`, and includes a placeholder photo-diagnosis upload route.

## Run the demo

Use two terminals.

Terminal 1 — bridge:

```bash
cd ../socket-server
npm start
```

Terminal 2 — dashboard:

```bash
cd dashboard
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The browser dashboard defaults to `http://localhost:3001`; set `NEXT_PUBLIC_SOCKET_URL` in `.env.local` if your bridge runs elsewhere, then restart `npm run dev`.

For Quest, keep its Unity bridge URL pointed at the laptop LAN IP (for example `http://10.216.60.138:3001`). The dashboard can remain open on the laptop at `localhost:3000`.

## Photo endpoint

`POST /api/diagnose-photo` uses Next.js native `request.formData()` multipart handling. It validates an image upload and returns a stable placeholder response. Replace the stub in `app/api/diagnose-photo/route.ts` with the model call when YOLOv8 is ready; the UI response contract can stay the same.
