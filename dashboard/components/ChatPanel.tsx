'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

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
  const faultConfidence = hasFault ? result.confidence || 'confirmed' : null;
  const starter = useMemo(() => {
    if (hasFault) return `Hi — I can see ${faultyComponents.join(', ') || 'a circuit issue'}: ${result.message} Want me to walk you through it?`;
    return 'Hi — your circuit looks clean right now. Ask me anything about the wiring or components.';
  }, [faultyComponents, hasFault, result.message]);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: starter, timestamp: 'Now' }]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const spokenFaultRef = useRef('');
  const speakNextResponseRef = useRef(false);
  const palette = paletteForResult(hasResult && result.ok, result.confidence || null, hasResult);

  const speak = useCallback((message: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    const faultKey = hasFault ? `${faultyComponents.join(',')}:${result.message}` : '';
    if (!faultKey) { spokenFaultRef.current = ''; return; }
    if (faultKey !== spokenFaultRef.current) {
      spokenFaultRef.current = faultKey;
      speak(`CircuitDoctor warning. ${result.message}`);
    }
  }, [faultyComponents, hasFault, result.message, speak]);

  useEffect(() => () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
    audioContextRef.current?.close();
    recognitionRef.current?.abort();
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onResponse = (payload: { ok?: boolean; message?: string }) => {
      const message = payload.message || 'I could not prepare a circuit-grounded response.';
      setMessages((current) => [...current, { role: 'assistant', content: message, timestamp: 'Just now' }]);
      setSending(false);
      if (speakNextResponseRef.current) {
        speakNextResponseRef.current = false;
        speak(message);
      }
    };
    const onVoiceResponse = (payload: { ok?: boolean; message?: string; transcript?: string }) => {
      const message = payload.message || 'I could not prepare a voice response.';
      setMessages((current) => {
        const updated = [...current];
        const voiceMessageIndex = updated.map((item) => item.content).lastIndexOf('Voice question');
        if (voiceMessageIndex >= 0 && payload.transcript) updated[voiceMessageIndex] = { ...updated[voiceMessageIndex], content: payload.transcript };
        return [...updated, { role: 'assistant', content: message, timestamp: 'Just now' }];
      });
      setSending(false);
      speak(message);
    };
    socket.on('chat:response', onResponse);
    socket.on('chat:voice-response', onVoiceResponse);
    return () => { socket.off('chat:response', onResponse); socket.off('chat:voice-response', onVoiceResponse); };
  }, [socket, speak]);

  const send = () => {
    const message = draft.trim();
    if (!message || sending || !socket) return;
    setMessages((current) => [...current, { role: 'user', content: message, timestamp: 'Just now' }]);
    setDraft('');
    speakNextResponseRef.current = false;
    setSending(true);
    socket.emit('chat:message', { sessionId, message });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submitVoice = (audioUrl: string) => {
    if (!socket) return;
    setMessages((current) => [...current, { role: 'user', content: 'Voice question', timestamp: 'Just now' }]);
    setSending(true);
    socket.emit('chat:voice', { sessionId, audioUrl });
  };

  const submitTranscript = (transcript: string) => {
    if (!socket) return;
    setMessages((current) => [...current, { role: 'user', content: transcript, timestamp: 'Just now' }]);
    speakNextResponseRef.current = true;
    setSending(true);
    socket.emit('chat:message', { sessionId, message: transcript });
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const startRecording = async () => {
    if (!socket || sending) {
      setMessages((current) => [...current, { role: 'assistant', content: 'Voice input is not available in this browser.', timestamp: 'Just now' }]);
      return;
    }
    const recognitionConstructor = (window as Window & { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).SpeechRecognition
      || (window as Window & { webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (recognitionConstructor) {
      const recognition = new recognitionConstructor();
      let transcript = '';
      let recognitionError = '';
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) transcript += event.results[index][0].transcript;
        }
      };
      recognition.onerror = (event) => { recognitionError = event.error; };
      recognition.onend = () => {
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
        recognitionRef.current = null;
        setRecording(false);
        const question = transcript.trim();
        if (question) submitTranscript(question);
        else if (recognitionError !== 'aborted') setMessages((current) => [...current, { role: 'assistant', content: recognitionError === 'not-allowed' ? 'Microphone access was not granted.' : 'I could not hear a question. Try again and speak a little closer to the microphone.', timestamp: 'Just now' }]);
      };
      recognitionRef.current = recognition;
      setRecording(true);
      recordingTimerRef.current = setTimeout(() => recognition.stop(), 10000);
      recognition.start();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessages((current) => [...current, { role: 'assistant', content: 'Voice input needs Chrome or Edge with microphone access.', timestamp: 'Just now' }]);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
        if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
        audioFrameRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!audio.size || audio.size > 1400000) {
          setMessages((current) => [...current, { role: 'assistant', content: 'That recording is too large. Please keep voice questions under 10 seconds.', timestamp: 'Just now' }]);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => { if (typeof reader.result === 'string') submitVoice(reader.result); };
        reader.readAsDataURL(audio);
      };
      recorder.start();
      setRecording(true);
      recordingTimerRef.current = setTimeout(() => recorder.stop(), 10000);
      if (typeof AudioContext !== 'undefined') {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        audioContextRef.current = audioContext;
        const samples = new Uint8Array(analyser.fftSize);
        let heardVoice = false;
        let silenceStartedAt: number | null = null;
        const checkForSilence = () => {
          analyser.getByteTimeDomainData(samples);
          const level = samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / samples.length;
          const now = performance.now();
          if (level > 4) { heardVoice = true; silenceStartedAt = null; }
          else if (heardVoice && silenceStartedAt === null) silenceStartedAt = now;
          if (silenceStartedAt !== null && now - silenceStartedAt > 1200) { stopRecording(); return; }
          audioFrameRef.current = requestAnimationFrame(checkForSilence);
        };
        checkForSilence();
      }
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: 'Microphone access was not granted.', timestamp: 'Just now' }]);
    }
  };

  const toggleRecording = () => { if (recording) stopRecording(); else void startRecording(); };

  useEffect(() => {
    if (!isOpen) return;
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || editable(event.target)) return;
      event.preventDefault();
      if (recognitionRef.current || recorderRef.current?.state === 'recording') stopRecording();
      else void startRecording();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); };
  }, [isOpen, socket, sending, recording]);

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
      <div className="flex items-center gap-2"><button type="button" onClick={() => setVoiceEnabled((enabled) => !enabled)} aria-label={voiceEnabled ? 'Mute CircuitDoctor voice' : 'Enable CircuitDoctor voice'} title={voiceEnabled ? 'Mute voice' : 'Enable voice'} className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition ${voiceEnabled ? 'border-slate-300 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{voiceEnabled ? '🔊' : '🔇'}</button><button type="button" onClick={onClose} aria-label="Close CircuitDoctor chat" className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-lg leading-none text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950">×</button></div>
    </div>

    <div className={`mt-4 shrink-0 rounded-xl border p-3 ${palette.tailwind}`}>
      <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">Live context</p>{faultConfidence && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${badgeClassForConfidence(faultConfidence)}`}>{faultConfidence}</span>}</div>
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
      <div className="mt-2 flex items-center justify-between gap-3"><button type="button" onClick={toggleRecording} disabled={sending || !socket} aria-pressed={recording} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-400 ${recording ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'}`}>{recording ? '● Stop recording' : '🎙 Ask by voice'}</button><span className="text-[10px] text-slate-400">Space: start / stop · pauses submit automatically</span><button type="submit" disabled={!draft.trim() || sending || !socket} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">Send</button></div>
    </form>
    </aside>
  </>;
}
