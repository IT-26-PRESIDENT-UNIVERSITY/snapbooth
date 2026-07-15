"use client";

import { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useStore } from '@/store/useStore';
import {
  RefreshCcw, User, Download, QrCode, Printer, X, Check,
  Timer, Video, Play, Image as ImageIcon, RotateCcw, ArrowRight
} from 'lucide-react';
import Script from 'next/script';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';

const FRAME_TEMPLATES = [
  { id: 'polaroid', label: 'Polaroid', url: '/templates/polaroid.svg' },
  { id: 'vintage', label: 'Vintage', url: '/templates/vintage.svg' },
  { id: 'neon', label: 'Neon', url: '/templates/neon.svg' }
];

declare global {
  interface Window { SelfieSegmentation: any; }
}

type AppPhase = 'capture' | 'review' | 'result';

export default function PhotoboothStudio() {
  const {
    templates, selectedTemplate, setSelectedTemplate,
    removeBackground, setRemoveBackground, finalImage, setFinalImage
  } = useStore();

  const webcamRef = useRef<Webcam>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isFlashing, setIsFlashing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [downloadId, setDownloadId] = useState('');
  const [hostUrl, setHostUrl] = useState('');

  const [timerDuration, setTimerDuration] = useState(3);
  const [livePhotoEnabled, setLivePhotoEnabled] = useState(true);

  const [appPhase, setAppPhase] = useState<AppPhase>('capture');
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);

  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'photo' | 'video'>('photo');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const capturedRef = useRef<string[]>([]);
  const retakeIndexRef = useRef<number | null>(null);

  const requiredPhotos =
    selectedTemplate?.layout === 'single' ? 1
    : selectedTemplate?.layout === 'strip-3' ? 3
    : selectedTemplate?.layout === 'grid-4' ? 4
    : (selectedTemplate?.isCustom ? 3 : 1);

    useEffect(() => {
    const active = templates.filter(t => t.active);
    if (!selectedTemplate && active.length > 0) {
      setSelectedTemplate(active[0]);
    }
  }, [templates, selectedTemplate, setSelectedTemplate]);

  useEffect(() => {
    if (typeof window !== 'undefined') setHostUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (!removeBackground) return;
    let running = true;
    let seg: any = null;

    const init = () => {
      const video = webcamRef.current?.video;
      const canvas = maskCanvasRef.current;
      if (!video || !canvas || !window.SelfieSegmentation) {
        if (running) setTimeout(init, 500);
        return;
      }
      const ctx = canvas.getContext('2d')!;
      seg = new window.SelfieSegmentation({
        locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
      });
      seg.setOptions({ modelSelection: 1 });
      seg.onResults((r: any) => {
        if (!running) return;
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(r.segmentationMask, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-in';
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(r.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      });
      const loop = async () => {
        if (!running) return;
        if (video.readyState >= 2) {
          try { await seg.send({ image: video }); } catch (_) {}
        }
        requestAnimationFrame(loop);
      };
      loop();
    };

    init();
    return () => { running = false; seg?.close(); };
  }, [removeBackground]);

  useEffect(() => {
    let running = true;
    let raf: number;
    let templateImg: HTMLImageElement | null = null;
    
    if (selectedTemplate) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedTemplate.url;
      img.onload = () => { templateImg = img; };
    }

    const draw = () => {
      if (!running) return;
      const video = webcamRef.current?.video;
      const lc = liveCanvasRef.current;
      const mc = maskCanvasRef.current;
      
      if (lc && video && video.readyState >= 2) {
        const ctx = lc.getContext('2d');
        if (ctx) {
          if (lc.width !== video.videoWidth) lc.width = video.videoWidth;
          if (lc.height !== video.videoHeight) lc.height = video.videoHeight;
          ctx.clearRect(0, 0, lc.width, lc.height);
          
          if (removeBackground && mc) {
            ctx.drawImage(mc, 0, 0, lc.width, lc.height);
          } else {
            ctx.save();
            ctx.translate(lc.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, lc.width, lc.height);
            ctx.restore();
          }
          
          if (templateImg) {
            ctx.drawImage(templateImg, 0, 0, lc.width, lc.height);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    
    draw();
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [removeBackground, selectedTemplate]);

  const grabFrame = async (): Promise<string | null> => {
    if (removeBackground && maskCanvasRef.current) {
      return maskCanvasRef.current.toDataURL('image/png');
    }
    const raw = webcamRef.current?.getScreenshot();
    if (!raw) return null;
    
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = raw; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  };

  const flash = () => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 120);
  };

  const startCaptureSequence = (startingPhotos: string[], forRetakeIndex: number | null) => {
    capturedRef.current = [...startingPhotos];
    retakeIndexRef.current = forRetakeIndex;

    if (livePhotoEnabled && !mediaRecorderRef.current && liveCanvasRef.current) {
      try {
        const stream = (liveCanvasRef.current as any).captureStream(30);
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        rec.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        rec.start(100);
        setTimeout(() => { if (rec.state === 'recording') rec.pause(); }, 150);
        mediaRecorderRef.current = rec;
      } catch (e) { console.warn(e); }
    }

    runCountdownThenSnap();
  };

  const runCountdownThenSnap = () => {
    const dur = timerDuration === 0 ? 0 : timerDuration;

    if (mediaRecorderRef.current?.state === 'paused') mediaRecorderRef.current.resume();

    if (dur === 0) {
      doSnap();
      return;
    }

    setCountdown(dur);
    let remaining = dur;
    const iv = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        clearInterval(iv);
        setCountdown(null);
        doSnap();
      }
    }, 1000);
  };

  const doSnap = async () => {
    flash();

    setTimeout(() => {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.pause();
    }, 400);

    const photo = await grabFrame();
    if (!photo) return;

    const ri = retakeIndexRef.current;
    if (ri !== null) {
      const updated = [...capturedRef.current];
      updated[ri] = photo;
      capturedRef.current = updated;
      setCapturedPhotos(updated);
      retakeIndexRef.current = null;
      setRetakeIndex(null);
      finishComposite();
    } else {
      capturedRef.current.push(photo);
      setCapturedPhotos([...capturedRef.current]);

      if (capturedRef.current.length < requiredPhotos) {
        setTimeout(() => {
          runCountdownThenSnap();
        }, 1000);
      } else {
        finishComposite();
      }
    }
  };

  const handleShutter = () => {
    if (isProcessing || countdown !== null) return;
    setIsProcessing(true);
    setCapturedPhotos([]);
    capturedRef.current = [];
    retakeIndexRef.current = null;
    setRetakeIndex(null);

    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];

    startCaptureSequence([], null);
  };

  const handleRetakeSingle = (index: number) => {
    setRetakeIndex(index);
    setAppPhase('capture');
    setIsProcessing(true);
    retakeIndexRef.current = index;
    startCaptureSequence(capturedPhotos, index);
  };

  const handleRetakeAll = () => {
    setCapturedPhotos([]);
    capturedRef.current = [];
    setRetakeIndex(null);
    setAppPhase('capture');
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];
    setFinalVideoUrl(null);
  };

  const detectSlots = (tplImg: HTMLImageElement, numSlots: number) => {
    const tc = document.createElement('canvas');
    tc.width = tplImg.naturalWidth || tplImg.width;
    tc.height = tplImg.naturalHeight || tplImg.height;
    const tctx = tc.getContext('2d')!;
    tctx.drawImage(tplImg, 0, 0);

    const W = tc.width, H = tc.height;
    let data: Uint8ClampedArray;
    try {
      data = tctx.getImageData(0, 0, W, H).data;
    } catch {
      return [];
    }

    const rowTrans = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let cnt = 0;
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] < 40) cnt++;
      }
      rowTrans[y] = cnt / W;
    }

    const THRESH = 0.25;
    const bands: { y1: number; y2: number }[] = [];
    let inBand = false, start = 0;
    for (let y = 0; y < H; y++) {
      if (!inBand && rowTrans[y] > THRESH) { inBand = true; start = y; }
      else if (inBand && rowTrans[y] <= THRESH) { inBand = false; bands.push({ y1: start, y2: y - 1 }); }
    }
    if (inBand) bands.push({ y1: start, y2: H - 1 });

    const slots = bands
      .map(b => {
        let x1 = W, x2 = 0;
        const midY = Math.floor((b.y1 + b.y2) / 2);
        for (let x = 0; x < W; x++) {
          if (data[(midY * W + x) * 4 + 3] < 40) {
            if (x < x1) x1 = x;
            if (x > x2) x2 = x;
          }
        }
        return { x: x1, y: b.y1, w: x2 - x1 + 1, h: b.y2 - b.y1 + 1 };
      })
      .filter(s => s.w > W * 0.1 && s.h > H * 0.04);

    slots.sort((a, b) => a.y - b.y);
    return slots;
  };

  const finishComposite = async () => {
    setIsProcessing(true);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (mediaRecorderRef.current.state === 'paused') mediaRecorderRef.current.resume();
      mediaRecorderRef.current.stop();
      await new Promise(r => setTimeout(r, 600));
      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setFinalVideoUrl(URL.createObjectURL(blob));
      }
      mediaRecorderRef.current = null;
    }

    if (!selectedTemplate) { setIsProcessing(false); return; }

    const tplImg = new Image();
    tplImg.crossOrigin = 'anonymous';
    await new Promise(r => { tplImg.onload = r; tplImg.src = selectedTemplate.url; });

    const W = tplImg.naturalWidth || 1200;
    const H = tplImg.naturalHeight || 1800;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { alpha: true })!;
    ctx.clearRect(0, 0, W, H);

    const builtinSlots: Record<string, Array<{x:number;y:number;w:number;h:number}>> = {
      'builtin-1': [{x:100, y:100, w:1000, h:1300}],
      'builtin-2': [{x:60,  y:60,  w:1080, h:1660}],
      'builtin-3': [{x:150, y:50,  w:900,  h:1700}],
    };
    const builtinHint = selectedTemplate?.id ? builtinSlots[selectedTemplate.id] : undefined;

    const photos = capturedRef.current;
    const slots = builtinHint || detectSlots(tplImg, photos.length);

    for (let i = 0; i < photos.length; i++) {
      const pImg = new Image();
      await new Promise(r => { pImg.onload = r; pImg.src = photos[i]; });
      const aspect = pImg.width / pImg.height;

      let slotX: number, slotY: number, slotW: number, slotH: number;

      if (slots.length >= photos.length) {
        const s = slots[i];
        slotX = s.x; slotY = s.y; slotW = s.w; slotH = s.h;
      } else {
        const layout = selectedTemplate.layout || (selectedTemplate.isCustom ? 'strip-3' : 'single');
        if (layout === 'single') {
          slotX = 0; slotY = 0; slotW = W; slotH = H;
        } else if (layout === 'strip-3') {
          slotX = 0; slotY = Math.floor(i * H / 3); slotW = W; slotH = Math.floor(H / 3);
        } else {
          slotX = (i % 2) * Math.floor(W / 2);
          slotY = Math.floor(i / 2) * Math.floor(H / 2);
          slotW = Math.floor(W / 2);
          slotH = Math.floor(H / 2);
        }
      }

      const slotAspect = slotW / slotH;
      let drawW: number, drawH: number, ox: number, oy: number;
      if (aspect > slotAspect) {
        drawH = slotH; drawW = drawH * aspect;
        ox = (slotW - drawW) / 2; oy = 0;
      } else {
        drawW = slotW; drawH = drawW / aspect;
        ox = 0; oy = (slotH - drawH) / 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(slotX, slotY, slotW, slotH);
      ctx.clip();
      ctx.drawImage(pImg, slotX + ox, slotY + oy, drawW, drawH);
      ctx.restore();
    }

    ctx.drawImage(tplImg, 0, 0, W, H);

    const finalData = c.toDataURL('image/png');
    setFinalImage(finalData);

    const id = Math.random().toString(36).slice(2, 10);
    setDownloadId(id);
    try { localStorage.setItem(`snapbooth_photo_${id}`, finalData); } catch (_) {}

    setAppPhase('result');
    setIsProcessing(false);
  };

  const resetAll = () => {
    setFinalImage(null);
    setFinalVideoUrl(null);
    setCapturedPhotos([]);
    capturedRef.current = [];
    setRetakeIndex(null);
    setAppPhase('capture');
    setIsProcessing(false);
    setViewMode('photo');
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];
  };

  const handleDownload = () => {
    if (viewMode === 'video' && finalVideoUrl) {
      const a = document.createElement('a'); a.href = finalVideoUrl; a.download = `snap-live-${Date.now()}.webm`; a.click();
    } else if (finalImage) {
      const a = document.createElement('a'); a.href = finalImage; a.download = `snap-${Date.now()}.jpg`; a.click();
    }
  };

  const handlePDF = async () => {
    if (!finalImage) return;
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('load failed'));
        img.src = finalImage;
      });

      const isPortrait = img.height >= img.width;
      const pdf = new jsPDF({
        orientation: isPortrait ? 'portrait' : 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const maxW = pw - margin * 2;
      const maxH = ph - margin * 2;

      const imgRatio = img.width / img.height;
      const pageRatio = maxW / maxH;

      let fw: number, fh: number;
      if (imgRatio > pageRatio) {
        fw = maxW;
        fh = fw / imgRatio;
      } else {
        fh = maxH;
        fw = fh * imgRatio;
      }

      const x = (pw - fw) / 2;
      const y = (ph - fh) / 2;

      pdf.addImage(finalImage, 'JPEG', x, y, fw, fh, undefined, 'FAST');
      pdf.save(`snapbooth-${Date.now()}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat PDF.');
    }
  };

  const cycleTimer = () => {
    setTimerDuration(t => t === 0 ? 3 : t === 3 ? 10 : 0);
  };

  const activeTemplates = templates.filter(t => t.active);
  const shotLabel = retakeIndex !== null
    ? `Ulang Foto ${retakeIndex + 1} dari ${requiredPhotos}`
    : `Foto ${capturedPhotos.length + 1} dari ${requiredPhotos}`;

    return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center bg-[#efefef] p-4 lg:p-8">
      <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js" strategy="lazyOnload" />

      <canvas ref={liveCanvasRef} className="hidden" />

      <div className="relative w-full max-w-5xl flex-1 bg-white rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] flex flex-col border border-gray-100">

        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/60 to-transparent z-40 pointer-events-none flex flex-col sm:flex-row justify-between items-start p-4 sm:p-5 gap-3">
          <span className="text-white/90 font-semibold tracking-tight text-lg drop-shadow-md">SnapBooth</span>

          {appPhase === 'capture' && (
            <div className="flex flex-wrap gap-2 pointer-events-auto">
              <button onClick={cycleTimer} className="h-9 px-3 flex items-center gap-1.5 rounded-full bg-black/20 backdrop-blur-md text-white border border-white/20 hover:bg-black/40 text-sm font-medium">
                <Timer size={14} /> <span className="hidden sm:inline">{timerDuration === 0 ? 'Mati' : `${timerDuration}s`}</span>
                <span className="sm:hidden">{timerDuration === 0 ? '0s' : `${timerDuration}s`}</span>
              </button>
              <button
                onClick={() => setLivePhotoEnabled(v => !v)}
                className={`h-9 px-3 flex items-center gap-1.5 rounded-full backdrop-blur-md text-sm font-medium transition-colors border border-white/20 ${livePhotoEnabled ? 'bg-yellow-400 text-black border-transparent' : 'bg-black/20 text-white hover:bg-black/40'}`}
              >
                <Video size={14} /> <span className="hidden sm:inline">{livePhotoEnabled ? 'Live' : 'Live Off'}</span>
              </button>

              <button
                onClick={() => setFacingMode(m => m === 'user' ? 'environment' : 'user')}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white border border-white/20 hover:bg-black/40"
              >
                <RefreshCcw size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 relative bg-black overflow-hidden flex flex-col">

          {appPhase === 'capture' && (
            <>
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored={true}
                screenshotFormat="image/png"
                videoConstraints={{ facingMode, width: 1280, height: 960 }}
                className={`w-full h-full object-cover ${removeBackground ? 'opacity-0 absolute inset-0' : ''}`}
              />

              <canvas
                ref={maskCanvasRef}
                width={1280}
                height={960}
                className={`absolute inset-0 w-full h-full object-cover ${removeBackground ? 'z-10' : 'hidden'}`}
              />

              {selectedTemplate?.url && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
                  <img
                    src={selectedTemplate.url}
                    alt="frame guide"
                    className="absolute inset-0 w-full h-full object-cover opacity-70"
                    style={{ mixBlendMode: 'normal' }}
                  />
                  <div className="absolute inset-0" style={{
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 15%, transparent 85%, rgba(0,0,0,0.25) 100%)'
                  }} />
                </div>
              )}

              {countdown !== null && (
                <div className="absolute inset-0 z-30 bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center">
                  <div className="text-[11rem] font-bold text-white drop-shadow-lg leading-none">{countdown}</div>
                  <div className="mt-4 bg-black/50 text-white text-sm font-medium px-4 py-1.5 rounded-full">{shotLabel}</div>
                </div>
              )}

              <div className={`absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-75 ${isFlashing ? 'opacity-100' : 'opacity-0'}`} />
            </>
          )}

          {appPhase === 'result' && finalImage && (
            <div className="w-full flex-1 min-h-0 bg-gray-50 z-30 flex flex-col p-4 sm:p-6 overflow-y-auto">
              <div className="flex-1 min-h-0 relative w-full flex items-center justify-center drop-shadow-xl">
                {viewMode === 'video' && finalVideoUrl
                  ? <video src={finalVideoUrl} autoPlay loop muted playsInline className="max-h-full max-w-full object-contain rounded-xl shadow-lg" />
                  : <img src={finalImage} alt="Hasil" className="max-h-full max-w-full object-contain rounded-xl shadow-lg" />
                }
                {finalVideoUrl && (
                  <div className="absolute top-3 right-3 flex bg-black/60 backdrop-blur-md rounded-full p-1 shadow-lg">
                    <button onClick={() => setViewMode('photo')} className={`p-2 rounded-full ${viewMode === 'photo' ? 'bg-white text-black' : 'text-white'}`}><ImageIcon size={14} /></button>
                    <button onClick={() => setViewMode('video')} className={`p-2 rounded-full ${viewMode === 'video' ? 'bg-white text-black' : 'text-white'}`}><Play size={14} /></button>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col items-center">
                <p className="text-sm font-semibold text-gray-500 mb-3 text-center">Ada yang kurang pas? Klik foto untuk mengulang</p>
                <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                  {capturedPhotos.map((photo, i) => (
                    <button key={i} onClick={() => handleRetakeSingle(i)} className="relative group w-16 h-20 sm:w-20 sm:h-28 rounded-xl overflow-hidden border-2 border-white shadow-md hover:border-black hover:shadow-xl transition-all flex-shrink-0">
                      <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                        <RotateCcw size={16} />
                        <span className="text-[10px] font-bold mt-1">Ulang {i + 1}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-auto min-h-[9rem] bg-white border-t border-gray-100 px-4 sm:px-5 py-4 flex flex-col sm:flex-row items-center gap-4 relative z-40">

          {appPhase === 'capture' && (
            <div className="w-full sm:flex-1 flex gap-2 overflow-x-auto items-center pb-2 sm:pb-0 pr-0 sm:pr-4 snap-x">
              {activeTemplates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  className={`relative flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 snap-center
                    ${selectedTemplate?.id === tpl.id ? 'border-black shadow-md' : 'border-gray-200'}`}
                >
                  {tpl.url ? (
                    <img src={tpl.url} alt={tpl.name} className="w-full h-full object-contain p-0.5" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Memuat</div>
                  )}
                  {selectedTemplate?.id === tpl.id && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center">
                      <Check size={9} color="white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className={`flex flex-wrap items-center gap-2 sm:gap-3 ${appPhase === 'capture' ? 'w-full sm:w-auto sm:ml-auto justify-center' : 'w-full justify-center'}`}>

            {appPhase === 'capture' && (
              <button
                onClick={handleShutter}
                disabled={isProcessing || countdown !== null}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-[5px] border-gray-200 bg-white shadow flex items-center justify-center disabled:opacity-40 hover:border-gray-300 transition-colors flex-shrink-0"
              >
                <div className="w-[44px] h-[44px] sm:w-[56px] sm:h-[56px] rounded-full bg-black hover:scale-95 transition-transform" />
              </button>
            )}

            {appPhase === 'result' && (
              <>
                <button onClick={resetAll} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 flex-shrink-0" title="Batal & Mulai Baru">
                  <X size={18} />
                </button>
                <button onClick={handleRetakeAll} disabled={isProcessing} className="h-10 sm:h-12 px-3 sm:px-5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors flex-shrink-0">
                  <RotateCcw size={14} className="sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Ulangi Semua</span>
                  <span className="sm:hidden">Ulang Semua</span>
                </button>
                <button onClick={handleDownload} className="btn-primary h-10 sm:h-12 px-4 sm:px-6 rounded-full flex items-center gap-1.5 text-xs sm:text-sm font-semibold shadow flex-shrink-0">
                  <Download size={14} className="sm:w-4 sm:h-4" /> Simpan {viewMode === 'video' && finalVideoUrl ? 'Video' : 'Foto'}
                </button>
                <button onClick={() => setShowQR(true)} className="h-10 sm:h-12 px-3 sm:px-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center gap-1.5 text-xs sm:text-sm font-medium flex-shrink-0">
                  <QrCode size={14} className="sm:w-4 sm:h-4" /> QR
                </button>
                <button onClick={handlePDF} className="h-10 sm:h-12 px-3 sm:px-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center gap-1.5 text-xs sm:text-sm font-medium flex-shrink-0">
                  <Printer size={14} className="sm:w-4 sm:h-4" /> PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showQR && finalImage && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full relative">
            <button onClick={() => setShowQR(false)} className="absolute top-5 right-5 w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center">
              <X size={18} />
            </button>
            <h3 className="text-xl font-bold mb-6">Scan & Download</h3>
            <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm mb-6">
              <QRCodeSVG value={`${hostUrl}/d/${downloadId}`} size={200} />
            </div>
            <p className="text-xs text-center text-gray-500 leading-relaxed">Scan kode QR dengan kamera HP Anda untuk mengunduh foto.</p>
          </div>
        </div>
      )}
    </div>
  );
}