'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type CircuitResult = { ok: boolean; message: string };
type LedEvent = { componentId: string; on: boolean };
type PhotoResult = { components: string[]; diagnosis: string; fileName: string };

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
const sessionId = process.env.NEXT_PUBLIC_SESSION_ID || 'demo-room';

function ConnectionDot({ connected }: { connected: boolean }) {
  return <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />;
}

export default function DashboardPage() {
  const [connected, setConnected] = useState(false);
  const [result, setResult] = useState<CircuitResult>({ ok: false, message: 'Waiting for an AR circuit update.' });
  const [hasResult, setHasResult] = useState(false);
  const [ledOn, setLedOn] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const socket: Socket = io(socketUrl, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('session:join', { sessionId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('circuit:result', (next: CircuitResult) => {
      setResult(next);
      setHasResult(true);
    });
    socket.on('simulation:led', (event: LedEvent) => {
      if (event.componentId === 'led-1') setLedOn(event.on);
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const chooseFile = useCallback((nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/')) {
      setUploadError('Choose a JPG, PNG, WEBP, or another image file.');
      return;
    }
    setUploadError(null);
    setPhotoResult(null);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  }, []);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { chooseFile(event.target.files?.[0] || null); }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    chooseFile(event.dataTransfer.files?.[0] || null);
  }

  async function diagnosePhoto() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const response = await fetch('/api/diagnose-photo', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Photo diagnosis failed.');
      setPhotoResult(data);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Photo diagnosis failed.');
    } finally {
      setUploading(false);
    }
  }

  const isOk = hasResult && result.ok;
  const statusClass = isOk ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : hasResult ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CircuitDoctor</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Live circuit diagnosis</h1>
            <p className="mt-2 text-sm text-slate-500">AR validation and visual inspection in one focused workspace.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <ConnectionDot connected={connected} />
            {connected ? `Connected · ${sessionId}` : 'Connecting to bridge…'}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live AR circuit status</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Quest session monitor</h2>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ledOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                LED {ledOn ? 'on' : 'off'}
              </span>
            </div>

            <div className={`rounded-xl border p-6 ${statusClass}`}>
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm ${isOk ? 'bg-emerald-500' : hasResult ? 'bg-red-500' : 'bg-slate-400'}`}>
                  <span className="text-lg font-bold text-white">{isOk ? '✓' : hasResult ? '!' : '…'}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{isOk ? 'Circuit OK' : hasResult ? 'Circuit fault' : 'No reading yet'}</p>
                  <p className="mt-1 text-base font-medium leading-6">{result.message}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-6 text-sm">
              <div><p className="text-xs text-slate-500">Bridge</p><p className="mt-1 font-medium text-slate-800">{connected ? 'Online' : 'Offline'}</p></div>
              <div><p className="text-xs text-slate-500">Session</p><p className="mt-1 font-medium text-slate-800">{sessionId}</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Photo diagnosis</p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Inspect a circuit image</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Upload a clear photo for component detection and a written diagnosis.</p>
            </div>

            {!previewUrl ? (
              <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => fileInput.current?.click()} className="cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-slate-400 hover:bg-slate-100">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-slate-500 shadow-sm">↑</div>
                <p className="text-sm font-medium text-slate-800">Drop a circuit photo here</p>
                <p className="mt-1 text-xs text-slate-500">or click to browse · JPG, PNG, WEBP · max 10 MB</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={previewUrl} alt="Circuit photo preview" className="h-52 w-full object-cover" />
                <div className="flex items-center justify-between gap-3 p-3">
                  <p className="truncate text-xs font-medium text-slate-600">{file?.name}</p>
                  <button onClick={() => fileInput.current?.click()} className="shrink-0 text-xs font-semibold text-slate-600 hover:text-slate-950">Replace</button>
                </div>
              </div>
            )}
            <input ref={fileInput} onChange={onFileChange} type="file" accept="image/*" className="hidden" />

            {uploadError && <p className="mt-3 text-xs font-medium text-red-600">{uploadError}</p>}
            <button disabled={!file || uploading} onClick={diagnosePhoto} className="mt-4 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              {uploading ? 'Analyzing photo…' : 'Run photo diagnosis'}
            </button>

            {photoResult && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Diagnosis</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{photoResult.diagnosis}</p>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Detected components</p>
                  <div className="mt-2 flex flex-wrap gap-2">{photoResult.components.map((component) => <span key={component} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">{component}</span>)}</div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
