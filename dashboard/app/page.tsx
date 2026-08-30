'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { CircuitGraph, type CircuitSnapshot } from '../components/CircuitGraph';
import { ChatPanel } from '../components/ChatPanel';
import { badgeClassForConfidence, circuitStatusColors, paletteForResult, type Confidence } from '../lib/circuitStatusColors';
import { downloadCircuitReport, type FaultHistory } from '../lib/circuitReport';

type CircuitResult = { ok: boolean; message: string; confidence?: Confidence; groundedOn?: string | null; suspectedComponent?: string | null; suspectedComponents?: string[]; faults?: Array<{ componentId: string; verdict?: Confidence; finalMessage?: string }> };
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
  const [intent, setIntent] = useState('');
  const [faultHistory, setFaultHistory] = useState<FaultHistory>({});
  const [isExporting, setIsExporting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphReportRef = useRef<HTMLDivElement | null>(null);

  const emitIntent = useCallback((value: string) => {
    if (intentTimerRef.current) clearTimeout(intentTimerRef.current);
    intentTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('circuit:intent', { sessionId, intent: value });
    }, 500);
  }, []);

  const onIntentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setIntent(value);
    emitIntent(value);
  }, [emitIntent]);

  useEffect(() => {
    const socket: Socket = io(socketUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); socket.emit('session:join', { sessionId }); if (intent) socket.emit('circuit:intent', { sessionId, intent }); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('circuit:update', (payload: { sessionId: string; circuit: CircuitSnapshot }) => {
      if (!payload?.circuit) return;
      console.log('[CircuitDoctor] circuit:update received', payload);
      setCircuit(payload.circuit);
    });
    socket.on('circuit:result', (next: CircuitResult) => {
      setResult(next);
      setHasResult(true);
      if (!next.ok) {
        const componentIds = next.faults?.map((fault) => fault.componentId) || next.suspectedComponents || (next.suspectedComponent ? [next.suspectedComponent] : []);
        setFaultHistory((current) => {
          const updated = { ...current };
          componentIds.forEach((componentId) => {
            const fault = next.faults?.find((item) => item.componentId === componentId);
            updated[componentId] = { verdict: fault?.verdict || next.confidence || null, message: fault?.finalMessage || next.message };
          });
          return updated;
        });
      }
    });
    return () => { if (intentTimerRef.current) clearTimeout(intentTimerRef.current); socketRef.current = null; socket.disconnect(); };
  }, []);

  const canExport = !!circuit && ((circuit.components?.length || 0) > 0 || (circuit.wires?.length || 0) > 0);
  const exportReport = useCallback(async () => {
    if (!circuit || !graphReportRef.current) return;
    setIsExporting(true);
    try {
      await downloadCircuitReport({ sessionId, intent, circuit, graphElement: graphReportRef.current, faultHistory });
    } finally {
      setIsExporting(false);
    }
  }, [circuit, faultHistory, intent]);

  const isOk = hasResult && result.ok;
  const palette = paletteForResult(isOk, result.confidence || null, hasResult);
  const faultConfidence = hasResult && !isOk ? result.confidence || 'confirmed' : null;
  const faultComponents = result.suspectedComponents?.length ? result.suspectedComponents : result.suspectedComponent ? [result.suspectedComponent] : [];
  const canChat = hasResult && !result.ok;

  return <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl">
    <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CircuitDoctor</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Live circuit diagnosis</h1><p className="mt-2 text-sm text-slate-500">AR validation and a live structural circuit graph in one workspace.</p></div>
      <div className="flex items-center gap-3"><Link href="/photo-diagnosis" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950">Photo diagnosis</Link><button type="button" onClick={exportReport} disabled={!canExport || isExporting} title={!canExport ? 'Build a circuit first.' : 'Download the current circuit report as a PDF'} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-400">{isExporting ? 'Preparing PDF…' : 'Download PDF'}</button><div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"><ConnectionDot connected={connected} />{connected ? `Connected · ${sessionId}` : 'Connecting to bridge…'}</div></div>
    </header>

    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-4"><label htmlFor="circuit-intent" className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">What are you building? <span className="normal-case font-normal tracking-normal">(optional)</span></label>{intent.trim() && <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>}</div><textarea id="circuit-intent" value={intent} onChange={onIntentChange} placeholder="e.g. PIR triggers LED when someone walks by" rows={2} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 transition" /></div>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7">
        <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live AR circuit status</p><h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Quest session monitor</h2></div>
        <div className={`rounded-xl border p-6 ${palette.tailwind}`}><div className="flex items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm" style={{ backgroundColor: palette.stroke }}><span className="text-lg font-bold text-white">{isOk ? '✓' : hasResult ? '!' : '◎'}</span></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{isOk ? 'Circuit OK' : hasResult ? 'Circuit fault' : 'Awaiting data'}</p>{faultConfidence && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize leading-4 ${badgeClassForConfidence(faultConfidence)}`}>{faultConfidence}</span>}</div><p className="mt-1 text-base font-medium leading-6">{result.message}</p>{hasResult && result.confidence && result.groundedOn && <p className="mt-2 text-xs leading-5 text-slate-500">Source: {result.groundedOn}</p>}{hasResult && faultComponents.length > 0 && <p className="mt-2 text-xs font-medium text-slate-600">Affected: {faultComponents.join(', ')}</p>}</div></div></div>
        {canChat && <button type="button" onClick={() => setChatOpen(true)} className="mt-5 text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950">Ask CircuitDoctor →</button>}
        <p className="mt-4 border-t border-slate-100 pt-4 text-[11px] text-slate-400">Live via Socket.IO · {sessionId}</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7"><div className="mb-6 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live circuit graph</p><h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Quest structural mirror</h2><p className="mt-1 text-sm text-slate-500">Nodes and wires appear as they are connected in AR.</p></div><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: circuitStatusColors.unconnected.stroke }} /> Gray <span className="ml-1 h-2 w-2 rounded-full" style={{ backgroundColor: circuitStatusColors.connected.stroke }} /> Green</div></div><div ref={graphReportRef} className="bg-white"><CircuitGraph circuit={circuit} faultComponents={faultComponents} confidence={result.confidence || null} /></div><p className="mt-4 text-xs text-slate-500">{circuit?.components?.length || 0} components · {circuit?.wires?.length || 0} wires{intent.trim() ? ` · Intent in use: ${intent.trim()}` : ''}</p></section>
    </div>
    <ChatPanel circuit={circuit} result={result} hasResult={hasResult} socket={socketRef.current} sessionId={sessionId} isOpen={chatOpen} onClose={() => setChatOpen(false)} />
  </div></main>;
}
