"use client";

import { useRef, useState, useEffect, useMemo } from 'react';
import Webcam from 'react-webcam';
import { useStore } from '@/store/useStore';
import {
  RefreshCcw, User, Download, QrCode, Printer, X, Check,
  Timer, Video, Play, Image as ImageIcon, RotateCcw, ArrowRight
} from 'lucide-react';
import Script from 'next/script';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';

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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'photo' | 'video'>('photo');

  const [templateSlots, setTemplateSlots] = useState<{x: number, y: number, w: number, h: number}[]>([]);
  const [templateSize, setTemplateSize] = useState<{w: number, h: number}>({w: 1200, h: 1800});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const requiredPhotos = useMemo(() => {
    if (!selectedTemplate) return 4;
    const layout = selectedTemplate.layout || (selectedTemplate.isCustom ? 'strip-3' : 'grid-4');
    if (layout === 'single') return 1;
    if (layout === 'strip-3') return 3;
    if (layout === 'grid-4') return 4;
    return 4;
  }, [selectedTemplate]);

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
    if (!selectedTemplate?.url) return;
    
    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!isMounted) return;
      const W = img.naturalWidth || 1200;
      const H = img.naturalHeight || 1800;
      setTemplateSize({ w: W, h: H });

      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { alpha: true })!;
      ctx.drawImage(img, 0, 0, W, H);
      
      let tplData: Uint8ClampedArray | null = null;
      try {
        tplData = ctx.getImageData(0, 0, W, H).data;
      } catch (e) {
        console.warn("Could not read template pixel data", e);
      }
      
      const layout = selectedTemplate.layout || (selectedTemplate.isCustom ? 'strip-3' : 'grid-4');
      const reqPhotos = layout === 'single' ? 1 : layout === 'strip-3' ? 3 : layout === 'grid-4' ? 4 : 4;
      
      const slots: {x: number, y: number, w: number, h: number}[] = [];
      for (let i = 0; i < reqPhotos; i++) {
        let qx = 0, qy = 0, qw = W, qh = H;
        
        if (layout === 'single') {
          qx = 0; qy = 0; qw = W; qh = H;
        } else if (layout === 'strip-3') {
          qx = 0; qy = Math.floor(i * H / 3); qw = W; qh = Math.floor(H / 3);
        } else {
          qx = (i % 2) * Math.floor(W / 2);
          qy = Math.floor(i / 2) * Math.floor(H / 2);
          qw = Math.floor(W / 2);
          qh = Math.floor(H / 2);
        }

        let slotX = qx, slotY = qy, slotW = qw, slotH = qh;

        if (tplData) {
          let minX = W, minY = H, maxX = 0, maxY = 0;
          let found = false;
          for (let y = qy; y < qy + qh; y++) {
            for (let x = qx; x < qx + qw; x++) {
              if (tplData[(y * W + x) * 4 + 3] < 40) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                found = true;
              }
            }
          }
          if (found) {
            slotX = minX; slotY = minY; slotW = maxX - minX + 1; slotH = maxY - minY + 1;
          }
        }
        slots.push({ x: slotX, y: slotY, w: slotW, h: slotH });
      }
      setTemplateSlots(slots);
    };
    img.src = selectedTemplate.url;
    
    return () => { isMounted = false; };
  }, [selectedTemplate]);

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
          try { await seg.send({ image: video }); } catch (_) { }
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
            if (facingMode === 'user') {
              ctx.translate(lc.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, lc.width, lc.height);
            ctx.restore();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [removeBackground, facingMode]);

  const grabFrame = async (): Promise<string | null> => {
    let raw: string | null = null;
    let isMask = false;

    if (removeBackground && maskCanvasRef.current) {
      raw = maskCanvasRef.current.toDataURL('image/png');
      isMask = true;
    } else {
      raw = webcamRef.current?.getScreenshot() || null;
    }

    if (!raw) return null;

    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = raw!; });

    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;

    if (!isMask && facingMode === 'user') {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  };

  const flash = () => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 120);
  };

  const capturedRef = useRef<string[]>([]);
  const retakeIndexRef = useRef<number | null>(null);

  const startCaptureSequence = (startingPhotos: string[], forRetakeIndex: number | null) => {
    capturedRef.current = [...startingPhotos];
    retakeIndexRef.current = forRetakeIndex;

    if (livePhotoEnabled && !mediaRecorderRef.current && liveCanvasRef.current) {
      try {
        const stream = (liveCanvasRef.current as any).captureStream(30);
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        rec.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        rec.start(500);
        mediaRecorderRef.current = rec;
      } catch (e) { console.warn(e); }
    }

    runCountdownThenSnap();
  };

  const runCountdownThenSnap = () => {
    const dur = timerDuration === 0 ? 0 : timerDuration;

    if (dur === 0) {
      setTimeout(() => doSnap(), 300);
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

    const photo = await grabFrame();
    if (!photo) { setIsProcessing(false); return; }

    const ri = retakeIndexRef.current;
    if (ri !== null) {
      const updated = [...capturedRef.current];
      updated[ri] = photo;
      capturedRef.current = updated;
      setCapturedPhotos(updated);
      retakeIndexRef.current = null;
      setRetakeIndex(null);
      setAppPhase('review');
      setIsProcessing(false);
    } else {
      capturedRef.current.push(photo);
      setCapturedPhotos([...capturedRef.current]);

      if (capturedRef.current.length < requiredPhotos) {
        setTimeout(() => {
          runCountdownThenSnap();
        }, 1000);
      } else {
        setAppPhase('review');
        setIsProcessing(false);
      }
    }
  };

  const handleShutter = () => {
    if (isProcessing || countdown !== null) return;
    setIsProcessing(true);

    if (retakeIndexRef.current !== null) {
      startCaptureSequence(capturedPhotos, retakeIndexRef.current);
      return;
    }

    setCapturedPhotos([]);
    capturedRef.current = [];
    retakeIndexRef.current = null;
    setRetakeIndex(null);
    setPreviewImage(null);

    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) { }
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];

    startCaptureSequence([], null);
  };

  const handleRetakeSingle = (index: number) => {
    setRetakeIndex(index);
    setAppPhase('capture');
    retakeIndexRef.current = index;

    if (timerDuration === 0) {
      setIsProcessing(false);
    } else {
      setIsProcessing(true);
      startCaptureSequence(capturedPhotos, index);
    }
  };

  const handleConfirmReview = () => {
    finishComposite();
  };

  const handleRetakeAll = () => {
    setCapturedPhotos([]);
    capturedRef.current = [];
    setRetakeIndex(null);
    setAppPhase('capture');
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) { }
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];
    setFinalVideoUrl(null);
  };

  const handleBackToReview = () => {
    setAppPhase('review');
    setFinalImage(null);
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

  const compositePhotos = async (template: typeof selectedTemplate, photos: string[], addWatermark: boolean = false): Promise<string | null> => {
    if (!template) return null;

    const tplImg = new Image();
    tplImg.crossOrigin = 'anonymous';
    await new Promise(r => { tplImg.onload = r; tplImg.onerror = r; tplImg.src = template.url; });
    if (!tplImg.naturalWidth) return null;

    const W = tplImg.naturalWidth || 1200;
    const H = tplImg.naturalHeight || 1800;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { alpha: true })!;
    ctx.clearRect(0, 0, W, H);

    // Get precise pixel data to map custom holes
    ctx.drawImage(tplImg, 0, 0, W, H);
    let tplData: Uint8ClampedArray | null = null;
    try {
      tplData = ctx.getImageData(0, 0, W, H).data;
    } catch (e) {
      console.warn("Could not read template pixel data", e);
    }
    ctx.clearRect(0, 0, W, H);

    const builtinSlots: Record<string, Array<{ x: number; y: number; w: number; h: number }>> = {
      'builtin-1': [{ x: 100, y: 100, w: 1000, h: 1300 }],
      'builtin-2': [{ x: 60, y: 60, w: 1080, h: 1660 }],
      'builtin-3': [{ x: 150, y: 50, w: 900, h: 1700 }],
    };
    const builtinHint = template?.id ? builtinSlots[template.id] : undefined;
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
        const layout = template.layout || (template.isCustom ? 'strip-3' : 'grid-4');
        let qx = 0, qy = 0, qw = W, qh = H;
        
        if (layout === 'single') {
          qx = 0; qy = 0; qw = W; qh = H;
        } else if (layout === 'strip-3') {
          qx = 0; qy = Math.floor(i * H / 3); qw = W; qh = Math.floor(H / 3);
        } else {
          qx = (i % 2) * Math.floor(W / 2);
          qy = Math.floor(i / 2) * Math.floor(H / 2);
          qw = Math.floor(W / 2);
          qh = Math.floor(H / 2);
        }

        slotX = qx; slotY = qy; slotW = qw; slotH = qh;

        // Precise hole detection inside the quadrant to perfectly align the photo
        if (tplData) {
          let minX = W, minY = H, maxX = 0, maxY = 0;
          let found = false;
          for (let y = qy; y < qy + qh; y++) {
            for (let x = qx; x < qx + qw; x++) {
              if (tplData[(y * W + x) * 4 + 3] < 40) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                found = true;
              }
            }
          }
          if (found) {
            slotX = minX; slotY = minY; slotW = maxX - minX + 1; slotH = maxY - minY + 1;
          }
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

    if (addWatermark) {
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
          logoImg.src = '/President_University_Logo.png';
        });
        const wmWidth = W * 0.15;
        const wmHeight = (logoImg.height / logoImg.width) * wmWidth;
        const padding = W * 0.03;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(logoImg, W - wmWidth - padding, H - wmHeight - padding, wmWidth, wmHeight);
        ctx.globalAlpha = 1.0;
      } catch (err) {
        console.warn('Failed to load watermark logo', err);
      }
    }

    return c.toDataURL('image/png');
  };

  const generatePreview = async (template: typeof selectedTemplate) => {
    if (!template || capturedPhotos.length === 0) {
      setPreviewImage(null);
      return;
    }
    const result = await compositePhotos(template, capturedPhotos, false);
    setPreviewImage(result);
  };

  useEffect(() => {
    if (appPhase === 'review' && selectedTemplate && capturedPhotos.length > 0) {
      generatePreview(selectedTemplate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, capturedPhotos, appPhase]);

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

    const finalData = await compositePhotos(selectedTemplate, capturedRef.current, true);
    if (!finalData) { setIsProcessing(false); return; }

    setFinalImage(finalData);

    const id = Math.random().toString(36).slice(2, 10);
    setDownloadId(id);
    try { localStorage.setItem(`presuniv_booth_photo_${id}`, finalData); } catch (_) { }

    setAppPhase('result');
    setIsProcessing(false);
  };

  const resetAll = () => {
    setFinalImage(null);
    setPreviewImage(null);
    setFinalVideoUrl(null);
    setCapturedPhotos([]);
    capturedRef.current = [];
    setRetakeIndex(null);
    setAppPhase('capture');
    setIsProcessing(false);
    setViewMode('photo');
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) { }
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];
  };

  const handleDownload = () => {
    if (viewMode === 'video' && finalVideoUrl) {
      const a = document.createElement('a'); a.href = finalVideoUrl; a.download = `PresUniv-Booth-Live-${Date.now()}.webm`; a.click();
    } else if (finalImage) {
      const a = document.createElement('a'); a.href = finalImage; a.download = `PresUniv-Booth-${Date.now()}.jpg`; a.click();
    }
  };

  const handlePrint = () => {
    if (!finalImage) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Photobooth</title>
            <style>
              body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: white; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              @media print {
                @page { margin: 0; }
                body { margin: 0; }
              }
            </style>
          </head>
          <body>
            <img src="${finalImage}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
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
      pdf.save(`PresUniv-Booth-${Date.now()}.pdf`);
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
    <div className="w-full h-screen flex flex-col lg:flex-row items-center justify-center bg-black lg:bg-gradient-to-br lg:from-[#00205B] lg:via-[#00153D] lg:to-[#8A1538] p-0 lg:p-6 relative overflow-hidden font-sans">
      <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js" strategy="lazyOnload" />

      <canvas ref={liveCanvasRef} className="hidden" />

      <div className="hidden lg:flex w-full lg:w-1/3 p-12 flex-col justify-center text-white z-10 text-left">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/President_University_Logo.png" alt="President University Logo" className="w-32 h-auto drop-shadow-lg" />
        </div>
        <h1 className="text-6xl font-extrabold tracking-tight mb-2 drop-shadow-xl">
          PresUniv<br /><span className="text-[#FDB813]">Booth.</span>
        </h1>
        <p className="text-lg text-white/80 drop-shadow mb-0 font-medium">
          Where Tomorrow&apos;s Leaders Make Memories.
        </p>
      </div>

      <div className="relative w-full h-full lg:w-2/3 lg:max-h-[90vh] flex-1 lg:bg-white lg:rounded-3xl overflow-hidden lg:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col lg:border lg:border-white/20 z-10">

        {appPhase === 'capture' && (
          <>
            <div className="lg:hidden absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-[#00205B]/90 via-[#00205B]/40 to-transparent z-20 pointer-events-none" />
            <div className="lg:hidden absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-[#8A1538]/90 via-[#8A1538]/40 to-transparent z-20 pointer-events-none" />
          </>
        )}

        <div className="lg:hidden absolute top-6 left-5 z-40 flex items-center gap-3 pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/President_University_Logo.png" alt="Logo" className="w-9 h-auto drop-shadow-lg" />
          <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-md">
            PresUniv<span className="text-[#FDB813]">.</span>
          </h1>
        </div>

        <div className="absolute top-0 right-0 lg:inset-x-0 lg:bg-gradient-to-b lg:from-black/80 lg:to-transparent z-40 pointer-events-none flex flex-col lg:flex-row justify-end lg:justify-between items-end lg:items-start p-5 gap-3">
          <span className="hidden lg:block text-white font-bold tracking-widest text-sm uppercase drop-shadow-md">President University</span>

          {appPhase === 'capture' && (
            <div className="flex flex-col lg:flex-row gap-3 pointer-events-auto mt-14 lg:mt-0">
              <button onClick={cycleTimer} className="h-10 lg:h-9 px-3 flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/30 hover:bg-black/60 shadow-lg text-sm font-medium transition-all">
                <Timer size={16} /> <span>{timerDuration === 0 ? 'Off' : `${timerDuration}s`}</span>
              </button>
              <button onClick={() => setFacingMode(m => m === 'user' ? 'environment' : 'user')} className="w-10 h-10 lg:w-9 lg:h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/30 hover:bg-black/60 shadow-lg transition-all">
                <RefreshCcw size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="absolute inset-0 lg:relative lg:inset-auto w-full h-full lg:flex-1 min-h-0 bg-black overflow-hidden flex flex-col z-0 lg:z-10">

          {/* Capture WYSIWYG Container */}
          <div 
            className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden bg-black transition-opacity duration-300 ${appPhase === 'capture' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`} 
          >
            {/* True WYSIWYG Live Rendering Engine */}
            <div 
              className="relative shadow-2xl h-full max-w-full flex-shrink-0" 
              style={{ aspectRatio: `${templateSize.w} / ${templateSize.h}` }}
            >
              {/* 1. Captured Frozen Photos */}
              {capturedPhotos.map((photo, i) => {
                const s = templateSlots[i];
                if (!s) return null;
                return (
                  <div 
                    key={i} 
                    className="absolute z-10 overflow-hidden"
                    style={{
                      left: `${(s.x / templateSize.w) * 100}%`,
                      top: `${(s.y / templateSize.h) * 100}%`,
                      width: `${(s.w / templateSize.w) * 100}%`,
                      height: `${(s.h / templateSize.h) * 100}%`
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} className="w-full h-full object-cover" alt="" />
                  </div>
                );
              })}

              {/* 2. Live Webcam (Only in the active slot!) */}
              {templateSlots[capturedPhotos.length] && (
                <div 
                  className="absolute z-10 overflow-hidden"
                  style={{
                    left: `${(templateSlots[capturedPhotos.length].x / templateSize.w) * 100}%`,
                    top: `${(templateSlots[capturedPhotos.length].y / templateSize.h) * 100}%`,
                    width: `${(templateSlots[capturedPhotos.length].w / templateSize.w) * 100}%`,
                    height: `${(templateSlots[capturedPhotos.length].h / templateSize.h) * 100}%`
                  }}
                >
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored={facingMode === 'user'}
                    screenshotFormat="image/png"
                    videoConstraints={{ facingMode, width: 1280, height: 960 }}
                    className={`absolute inset-0 w-full h-full object-cover ${(appPhase !== 'capture' || removeBackground) ? 'opacity-0' : ''}`}
                  />
                  <canvas
                    ref={maskCanvasRef}
                    width={1280}
                    height={960}
                    className={`absolute inset-0 w-full h-full object-cover ${(appPhase === 'capture' && removeBackground) ? 'opacity-100' : 'opacity-0'}`}
                  />
                </div>
              )}

              {/* 3. The Template Image Overlay */}
              {selectedTemplate?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={selectedTemplate.url} 
                  className="absolute inset-0 w-full h-full z-20 pointer-events-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" 
                  alt="Template" 
                />
              )}
            </div>

            {appPhase === 'capture' && countdown !== null && (
              <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="text-[11rem] font-bold text-white drop-shadow-[0_0_25px_rgba(253,184,19,0.5)] leading-none">{countdown}</div>
                <div className="mt-4 bg-[#8A1538] text-white text-sm font-bold px-5 py-2 rounded-full border border-white/20 shadow-lg">{shotLabel}</div>
              </div>
            )}

            {appPhase === 'capture' && (
              <div className={`absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-75 ${isFlashing ? 'opacity-100' : 'opacity-0'}`} />
            )}

            {/* Template Selector Overlay during Capture */}
            {appPhase === 'capture' && countdown === null && (
              <div className="absolute bottom-6 left-0 right-0 z-40 flex flex-col items-center">
                <div className="bg-black/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 shadow-2xl max-w-[90%]">
                  <div className="text-white/80 text-xs font-bold text-center mb-2 uppercase tracking-wider">Pilih Frame</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 snap-x custom-scrollbar justify-center">
                    {activeTemplates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => setSelectedTemplate(tpl)}
                        className={`relative flex-shrink-0 w-14 h-20 sm:w-16 sm:h-22 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 snap-center
                          ${selectedTemplate?.id === tpl.id ? 'border-[#FDB813] shadow-[0_0_12px_rgba(253,184,19,0.6)]' : 'border-white/30 hover:border-white/60'}`}
                      >
                        {tpl.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tpl.url} alt={tpl.name} className="w-full h-full object-contain p-0.5 bg-black/40" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-white/50">Wait</div>
                        )}
                        {selectedTemplate?.id === tpl.id && (
                          <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#FDB813] rounded-full flex items-center justify-center shadow-md">
                            <Check size={9} color="#00205B" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {appPhase === 'review' && capturedPhotos.length > 0 && (
            <div className="absolute inset-0 lg:relative lg:inset-auto w-full h-full lg:flex-1 min-h-0 lg:bg-gray-50 bg-black/95 backdrop-blur-md z-30 flex flex-col p-4 sm:p-6 overflow-y-auto">

              <div className="flex-1 min-h-0 relative w-full flex items-center justify-center mb-4">
                {previewImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewImage} alt="Preview" className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border-2 border-white/20 lg:border-gray-200" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
                    <ImageIcon size={48} className="text-white/30 lg:text-gray-300" />
                    <p className="text-sm font-bold lg:text-gray-400 text-white/50">Pilih frame di bawah untuk melihat preview</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3">
                {capturedPhotos.map((photo, i) => (
                  <button key={i} onClick={() => handleRetakeSingle(i)} className="relative group w-12 h-16 sm:w-14 sm:h-18 rounded-lg overflow-hidden border-2 border-white/20 lg:border-gray-200 shadow-sm hover:border-[#8A1538] hover:shadow-lg transition-all flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-[#8A1538]/70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white backdrop-blur-sm">
                      <RotateCcw size={14} />
                      <span className="text-[8px] font-bold">Ulang</span>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] font-bold text-center py-px">Foto {i + 1}</div>
                  </button>
                ))}
                <button onClick={handleRetakeAll} className="w-12 h-16 sm:w-14 sm:h-18 rounded-lg border-2 border-dashed border-red-400/50 flex flex-col items-center justify-center text-red-300 lg:text-red-400 hover:border-red-400 hover:bg-red-500/10 transition-all flex-shrink-0">
                  <RotateCcw size={14} />
                  <span className="text-[7px] font-bold mt-0.5">Ulang<br />Semua</span>
                </button>
              </div>

              <div className="flex justify-center">
                <button onClick={handleConfirmReview} disabled={isProcessing || !selectedTemplate || !previewImage} className="h-11 px-8 rounded-full bg-gradient-to-r from-[#00205B] to-[#8A1538] text-white flex items-center gap-2 text-sm font-extrabold shadow-xl hover:shadow-2xl transition-all disabled:opacity-40">
                  {isProcessing ? 'Memproses...' : <><Download size={16} /> Simpan Hasil</>}
                </button>
              </div>
            </div>
          )}

          {appPhase === 'result' && finalImage && (
            <div className="absolute inset-0 lg:relative lg:inset-auto w-full h-full lg:flex-1 min-h-0 lg:bg-gray-50 bg-black/95 backdrop-blur-md z-30 flex flex-col p-4 sm:p-6 pb-48 lg:pb-6 overflow-y-auto">
              <div className="flex-1 min-h-0 relative w-full flex items-center justify-center drop-shadow-xl mt-10 lg:mt-0">
                {viewMode === 'video' && finalVideoUrl
                  ? <video src={finalVideoUrl} autoPlay loop muted playsInline className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border-4 border-white lg:border-white border-white/20" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={finalImage} alt="Hasil" className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border-4 border-white lg:border-white border-white/20" />
                }
                {finalVideoUrl && (
                  <div className="absolute top-3 right-3 flex bg-black/60 backdrop-blur-md rounded-full p-1 shadow-lg">
                    <button onClick={() => setViewMode('photo')} className={`p-2 rounded-full transition-colors ${viewMode === 'photo' ? 'bg-[#FDB813] text-black' : 'text-white'}`}><ImageIcon size={14} /></button>
                    <button onClick={() => setViewMode('video')} className={`p-2 rounded-full transition-colors ${viewMode === 'video' ? 'bg-[#FDB813] text-black' : 'text-white'}`}><Play size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 inset-x-0 lg:relative lg:bottom-auto lg:inset-x-auto h-auto min-h-[9rem] lg:bg-white bg-transparent lg:border-t lg:border-gray-100 px-4 sm:px-5 pb-8 pt-4 lg:py-4 flex items-center justify-center gap-4 z-40 pointer-events-none">

          <div className={`flex flex-col lg:flex-row items-center gap-2 sm:gap-3 pointer-events-auto ${appPhase === 'capture' ? 'w-full items-center justify-center' : 'w-full justify-center flex-wrap flex-row'}`}>

            {appPhase === 'capture' && (
              <div className="flex flex-col items-center">
                <p className="lg:hidden text-white/90 text-[10px] font-bold tracking-widest drop-shadow-md mb-3 text-center pointer-events-none">
                  WHERE TOMORROW&apos;S LEADERS MAKE MEMORIES.
                </p>

                <button onClick={handleShutter} disabled={isProcessing || countdown !== null} className="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-[5px] border-white/80 lg:border-gray-200 bg-white/20 lg:bg-white shadow-xl flex items-center justify-center disabled:opacity-40 hover:border-[#FDB813] lg:hover:border-[#8A1538] transition-colors flex-shrink-0 group backdrop-blur-sm lg:backdrop-blur-none">
                  <div className="w-[46px] h-[46px] lg:w-[56px] lg:h-[56px] rounded-full bg-gradient-to-br from-[#8A1538] to-[#600e26] group-hover:scale-95 transition-transform shadow-inner" />
                </button>
              </div>
            )}

            {appPhase === 'result' && (
              <>
                <button onClick={handleBackToReview} disabled={isProcessing} className="h-10 sm:h-12 px-3 sm:px-5 rounded-full lg:bg-gray-100 bg-white/20 backdrop-blur-md lg:text-[#00205B] text-white lg:hover:bg-gray-200 hover:bg-white/30 flex items-center gap-1.5 text-xs sm:text-sm font-bold transition-colors flex-shrink-0 border border-transparent lg:border-none border-white/30 shadow-lg lg:shadow-none">
                  <ArrowRight size={14} className="rotate-180 sm:w-4 sm:h-4" /> Ganti Template
                </button>
                <button onClick={handleRetakeAll} disabled={isProcessing} className="h-10 sm:h-12 px-3 sm:px-5 rounded-full lg:bg-red-50 bg-red-500/20 backdrop-blur-md lg:text-[#8A1538] text-red-100 lg:hover:bg-red-100 hover:bg-red-500/40 flex items-center gap-1.5 text-xs sm:text-sm font-bold transition-colors flex-shrink-0 border border-transparent lg:border-none border-red-400/30">
                  <RotateCcw size={14} className="sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Ulangi Semua</span>
                  <span className="sm:hidden">Ulang Semua</span>
                </button>
                <button onClick={handleDownload} className="lg:bg-[#00205B] bg-[#FDB813] lg:hover:bg-[#00153D] hover:bg-[#e0a210] lg:text-white text-[#00205B] h-10 sm:h-12 px-4 sm:px-6 rounded-full flex items-center gap-1.5 text-xs sm:text-sm font-extrabold shadow-xl flex-shrink-0 transition-colors">
                  <Download size={14} className="sm:w-4 sm:h-4" /> Simpan Foto
                </button>
                <button onClick={handlePrint} className="h-10 sm:h-12 px-3 sm:px-5 rounded-full lg:bg-gray-100 bg-white/20 backdrop-blur-md lg:hover:bg-gray-200 flex items-center gap-1.5 text-xs sm:text-sm font-bold lg:text-[#00205B] text-white flex-shrink-0 transition-colors border border-transparent lg:border-none border-white/30 shadow-lg lg:shadow-none">
                  <Printer size={14} className="sm:w-4 sm:h-4" /> Print
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showQR && finalImage && (
        <div className="fixed inset-0 bg-black/80 lg:bg-[#00205B]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full relative">
            <button onClick={() => setShowQR(false)} className="absolute top-5 right-5 w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500">
              <X size={18} />
            </button>
            <h3 className="text-xl font-extrabold text-[#00205B] mb-6">Scan & Download</h3>
            <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm mb-6">
              <QRCodeSVG value={`${hostUrl}/d?id=${downloadId}`} size={200} fgColor="#00205B" />
            </div>
            <p className="text-xs text-center text-gray-500 font-medium leading-relaxed">Scan kode QR dengan kamera HP Anda untuk mengunduh foto ke device masing-masing.</p>
          </div>
        </div>
      )}
    </div>
  );
}
