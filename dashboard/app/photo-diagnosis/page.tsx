'use client';

import Link from 'next/link';
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';

type PhotoResult = { components: string[]; diagnosis: string; fileName: string };

export default function PhotoDiagnosisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const chooseFile = useCallback((nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/')) { setUploadError('Choose a JPG, PNG, WEBP, or another image file.'); return; }
    setUploadError(null); setPhotoResult(null); setFile(nextFile); setPreviewUrl(URL.createObjectURL(nextFile));
  }, []);
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0] || null);
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0] || null); };
  async function diagnosePhoto() {
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const formData = new FormData(); formData.append('photo', file);
      const response = await fetch('/api/diagnose-photo', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Photo diagnosis failed.');
      setPhotoResult(data);
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Photo diagnosis failed.'); } finally { setUploading(false); }
  }

  return <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto max-w-3xl"><header className="mb-8 flex items-end justify-between border-b border-slate-200 pb-6"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CircuitDoctor</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Media diagnosis</h1><p className="mt-2 text-sm text-slate-500">Inspect a circuit photo or video separately from the live Quest session.</p></div><Link href="/" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:text-slate-950">Live graph</Link></header><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:p-7"><p className="text-sm leading-6 text-slate-500">Upload a clear photo or video for component detection and a written diagnosis.</p>{!previewUrl ? <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => fileInput.current?.click()} className="mt-6 cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-slate-400 hover:bg-slate-100"><div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-slate-500 shadow-sm">↑</div><p className="text-sm font-medium text-slate-800">Drop a circuit photo or video here</p><p className="mt-1 text-xs text-slate-500">or click to browse · JPG, PNG, MP4, WEBM · max 10 MB</p></div> : <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{file?.type.startsWith('video/') ? <video src={previewUrl} controls className="h-72 w-full object-contain bg-black" /> : <img src={previewUrl} alt="Circuit preview" className="h-72 w-full object-cover" />}<div className="flex items-center justify-between gap-3 p-3"><p className="truncate text-xs font-medium text-slate-600">{file?.name}</p><button onClick={() => fileInput.current?.click()} className="shrink-0 text-xs font-semibold text-slate-600 hover:text-slate-950">Replace</button></div></div>}<input ref={fileInput} onChange={onFileChange} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" />{uploadError && <p className="mt-3 text-xs font-medium text-red-600">{uploadError}</p>}<button disabled={!file || uploading} onClick={diagnosePhoto} className="mt-4 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{uploading ? 'Analyzing media…' : 'Run diagnosis'}</button>{photoResult && (
  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Diagnosis</p>
        {photoResult.reka && !photoResult.reka.error && (
          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">✨ AI Verified</span>
        )}
      </div>
      {photoResult.reka?.error && <span className="text-xs text-red-500">AI unavailable: {photoResult.reka.error}</span>}
    </div>

    {/* The main combined text */}
    <div className="text-sm leading-6 text-slate-800">
      {photoResult.reka && !photoResult.reka.error ? (
        <div className="flex flex-col gap-3">
          <p className="font-medium">{photoResult.reka.final_diagnosis}</p>
          {photoResult.reka.visual_notes && (
            <p className="text-slate-600">{photoResult.reka.visual_notes}</p>
          )}
        </div>
      ) : (
        <p>{photoResult.diagnosis}</p>
      )}
    </div>
    
  </div>
)}
</section></div></main>;
}
