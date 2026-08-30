'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { badgeClassForConfidence, paletteForResult, type Confidence } from '../lib/circuitStatusColors';
import type { CircuitSnapshot } from './CircuitGraph';

type CircuitResult = {
  ok: boolean;
  message: string;
  confidence?: Confidence;
  suspectedComponent?: string | null;
  suspectedComponents?: string[];
};

type ChatMessage = { role: 'assistant' | 'user'; content: string; timestamp: string };

type Props = {
  circuit: CircuitSnapshot | null;
  result: CircuitResult;
  hasResult: boolean;
  socket: Socket | null;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
};

function faultIds(result: CircuitResult) {
  return result.suspectedComponents?.length ? result.suspectedComponents : result.suspectedComponent ? [result.suspectedComponent] : [];
}

export function ChatPanel({ circuit, result, hasResult, socket, sessionId, isOpen, onClose }: Props) {
  const components = circuit?.components || [];
  const faultyComponents = faultIds(result);
  const hasFault = hasResult && !result.ok;
  const starter = useMemo(() => {
    if (hasFault) return `Hi — I can see ${faultyComponents.join(', ') || 'a circuit issue'}: ${result.message} Want me to walk you through it?`;
    return 'Hi — your circuit looks clean right now. Ask me anything about the wiring or components.';
  }, [faultyComponents, hasFault, result.message]);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: starter, timestamp: 'Now' }]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const palette = paletteForResult(hasResult && result.ok, result.confidence || null, hasResult);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!socket) return;
    const onResponse = (payload: { ok?: boolean; message?: string }) => {
      setMessages((current) => [...current, { role: 'assistant', content: payload.message || 'I could not prepare a circuit-grounded response.', timestamp: 'Just now' }]);
      setSending(false);
    };
    socket.on('chat:response', onResponse);
    return () => { socket.off('chat:response', onResponse); };
  }, [socket]);

  const send = () => {
    const message = draft.trim();
    if (!message || sending || !socket) return;
    setMessages((current) => [...current, { role: 'user', content: message, timestamp: 'Just now' }]);
    setDraft('');
    setSending(true);
    socket.emit('chat:message', { sessionId, message });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); send(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return <>
    <button type="button" aria-label="Close CircuitDoctor chat" onClick={onClose} className={`fixed inset-0 z-40 cursor-default bg-slate-950/35 transition-opacity duration-300 ${isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} />
    <aside role="dialog" aria-modal="true" aria-hidden={!isOpen} className={`fixed inset-y-0 right-0 z-50 flex h-screen w-full max-w-[420px] flex-col border-l border-slate-200 bg-white p-5 shadow-2xl transition-transform duration-300 ease-out sm:p-6 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
    <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ask CircuitDoctor</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Circuit-aware help</h2></div>
      <button type="button" onClick={onClose} aria-label="Close CircuitDoctor chat" className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-lg leading-none text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950">×</button>
    </div>

    <div className={`mt-4 shrink-0 rounded-xl border p-3 ${palette.tailwind}`}>
      <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">Live context</p>{hasResult && result.confidence && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${badgeClassForConfidence(result.confidence)}`}>{result.confidence}</span>}</div>
      <p className="mt-1 text-sm font-medium text-slate-800">{components.length ? components.map((component) => component.id).join(', ') : 'Latest diagnosis only'}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{hasFault ? `${faultyComponents.join(', ') || 'Fault'} · ${result.message}` : 'No active fault in the most recent diagnosis.'}</p>
    </div>

    <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
      {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex flex-col gap-1 ${message.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-5 shadow-sm ${message.role === 'user' ? 'rounded-br-md bg-slate-900 text-white' : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700'}`}>{message.content}</div><span className="px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">{message.role === 'user' ? 'You' : 'CircuitDoctor'} · {message.timestamp}</span></div>)}
      {sending && <div className="w-fit rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400" />Checking the live circuit…</div>}
      <div ref={endRef} />
    </div>

    <form onSubmit={submit} className="mt-4 shrink-0 border-t border-slate-100 pt-4">
      <label htmlFor="circuit-chat-message" className="sr-only">Ask about this circuit</label>
      <textarea ref={inputRef} id="circuit-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} rows={2} placeholder="Ask about this circuit…" className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300" />
      <div className="mt-2 flex justify-end"><button type="submit" disabled={!draft.trim() || sending || !socket} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">Send</button></div>
    </form>
    </aside>
  </>;
}
