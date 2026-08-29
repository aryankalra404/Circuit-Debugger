'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { CircuitGraph, type CircuitSnapshot } from '../components/CircuitGraph';
import { badgeClassForConfidence, circuitStatusColors, paletteForResult, type Confidence } from '../lib/circuitStatusColors';

type CircuitResult = { ok: boolean; message: string; confidence?: Confidence; groundedOn?: string | null; suspectedComponent?: string | null; suspectedComponents?: string[] };
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
const sessionId = process.env.NEXT_PUBLIC_SESSION_ID || 'demo-room';

function ConnectionDot({ connected }: { connected: boolean }) {
  return <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />;
}

export default function DashboardPage() {
  const [connected, setConnected] = useState(false);
  const [result, setResult] = useState<CircuitResult>({ ok: false, message: 'Waiting for an AR circuit update.' });
  const [hasResult, setHasResult] = useState(false);
  const [circuit, setCircuit] = useState<CircuitSnapshot | null>(null);

  useEffect(() => {
    const socket: Socket = io(socketUrl, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setConnected(true); socket.emit('session:join', { sessionId }); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('circuit:update', (payload: { sessionId: string; circuit: CircuitSnapshot }) => {
      if (!payload?.circuit) return;
      console.log('[CircuitDoctor] circuit:update received', payload);
      setCircuit(payload.circuit);
    });
    socket.on('circuit:result', (next: CircuitResult) => { setResult(next); setHasResult(true); });
    return () => { socket.disconnect(); };
  }, []);

  const isOk = hasResult && result.ok;
  const palette = paletteForResult(isOk, result.confidence || null);
  const faultComponents = result.suspectedComponents?.length ? result.suspectedComponents : result.suspectedComponent ? [result.suspectedComponent] : [];

  return <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl">
    <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CircuitDoctor</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Live circuit diagnosis</h1><p className="mt-2 text-sm text-slate-500">AR validation and a live structural circuit graph in one workspace.</p></div>
      <div className="flex items-center gap-3"><Link href="/photo-diagnosis" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950">Photo diagnosis</Link><div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"><ConnectionDot connected={connected} />{connected ? `Connected · ${sessionId}` : 'Connecting to bridge…'}</div></div>
    </header>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7">
        <div className="mb-7 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live AR circuit status</p><h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Quest session monitor</h2></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Bridge {connected ? 'online' : 'offline'}</span></div>
        <div className={`rounded-xl border p-6 ${palette.tailwind}`}><div className="flex items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm" style={{ backgroundColor: palette.stroke }}><span className="text-lg font-bold text-white">{isOk ? '✓' : hasResult ? '!' : '…'}</span></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{isOk ? 'Circuit OK' : hasResult ? 'Circuit fault' : 'No reading yet'}</p>{hasResult && result.confidence && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize leading-4 ${badgeClassForConfidence(result.confidence)}`}>{result.confidence}</span>}</div><p className="mt-1 text-base font-medium leading-6">{result.message}</p>{hasResult && result.confidence && result.groundedOn && <p className="mt-2 text-xs leading-5 text-slate-500">Source: {result.groundedOn}</p>}{hasResult && faultComponents.length > 0 && <p className="mt-2 text-xs font-medium text-slate-600">Affected: {faultComponents.join(', ')}</p>}</div></div></div>
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-6 text-sm"><div><p className="text-xs text-slate-500">Bridge</p><p className="mt-1 font-medium text-slate-800">{connected ? 'Online' : 'Offline'}</p></div><div><p className="text-xs text-slate-500">Session</p><p className="mt-1 font-medium text-slate-800">{sessionId}</p></div></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7"><div className="mb-6 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live circuit graph</p><h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Quest structural mirror</h2><p className="mt-1 text-sm text-slate-500">Nodes and wires appear as they are connected in AR.</p></div><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: circuitStatusColors.unconnected.stroke }} /> Gray <span className="ml-1 h-2 w-2 rounded-full" style={{ backgroundColor: circuitStatusColors.connected.stroke }} /> Green</div></div><CircuitGraph circuit={circuit} faultComponents={faultComponents} confidence={result.confidence || null} /><p className="mt-4 text-xs text-slate-500">{circuit?.components?.length || 0} components · {circuit?.wires?.length || 0} wires</p></section>
    </div>
  </div></main>;
}
