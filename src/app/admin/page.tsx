"use client";

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { idbSaveImage, idbLoadAllImages, idbDeleteImage } from '@/lib/idb';
import { Trash2, Upload, Plus, AlertCircle, ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';

export default function AdminPage() {
  const { templates, addCustomTemplate, removeCustomTemplate, toggleTemplateActive, hydrateTemplateUrl } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeBlack, setRemoveBlack] = useState(true);
  const [selectedLayout, setSelectedLayout] = useState<'single' | 'strip-3' | 'grid-4'>('single');
  const [idbLoaded, setIdbLoaded] = useState(false);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [reuploadTargetId, setReuploadTargetId] = useState<string | null>(null);

  // Hydrate custom template URLs from IndexedDB on mount
  useEffect(() => {
    idbLoadAllImages().then(images => {
      Object.entries(images).forEach(([id, url]) => {
        hydrateTemplateUrl(id, url);
      });
    }).catch(console.error).finally(() => setIdbLoaded(true));
  }, [hydrateTemplateUrl]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '123456';
    if (pinInput === correctPin) {
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const processImageRemovingBlack = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const W = canvas.width;
          const H = canvas.height;

          // Only pixels that are very dark qualify as "black slot"
          const isBlack = (x: number, y: number) => {
            const i = (y * W + x) * 4;
            return data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40;
          };

          // Connected component labeling — find all contiguous black regions
          const visited = new Uint8Array(W * H);
          // Minimum size to be considered a "photo slot" (0.5% of total pixels)
          const MIN_SLOT_SIZE = W * H * 0.005;

          for (let startY = 0; startY < H; startY++) {
            for (let startX = 0; startX < W; startX++) {
              const startPos = startY * W + startX;
              if (!isBlack(startX, startY) || visited[startPos]) continue;

              // BFS / flood-fill this connected black region
              const region: number[] = [];
              const stack = [startPos];
              visited[startPos] = 1;

              while (stack.length > 0) {
                const pos = stack.pop()!;
                region.push(pos);
                const x = pos % W;
                const y = Math.floor(pos / W);

                if (x > 0     && !visited[pos - 1] && isBlack(x - 1, y)) { visited[pos - 1] = 1; stack.push(pos - 1); }
                if (x < W - 1 && !visited[pos + 1] && isBlack(x + 1, y)) { visited[pos + 1] = 1; stack.push(pos + 1); }
                if (y > 0     && !visited[pos - W] && isBlack(x, y - 1)) { visited[pos - W] = 1; stack.push(pos - W); }
                if (y < H - 1 && !visited[pos + W] && isBlack(x, y + 1)) { visited[pos + W] = 1; stack.push(pos + W); }
              }

              // Only erase LARGE regions = photo slots. Small regions = logos/text → keep.
              if (region.length >= MIN_SLOT_SIZE) {
                for (const pos of region) {
                  data[pos * 4 + 3] = 0; // transparent
                }
              }
            }
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          console.error('Canvas processing failed', e);
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    const file = files[0];

    // 10MB limit — IndexedDB can handle much more than localStorage
    if (file.size > 10 * 1024 * 1024) {
      setError('Ukuran file maksimal 10MB.');
      setIsUploading(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let dataUrl = event.target?.result as string;

      if (removeBlack) {
        try { dataUrl = await processImageRemovingBlack(dataUrl); }
        catch (err) { console.error('Failed to remove black bg', err); }
      }

      const id = `custom-${Date.now()}`;

      // Save image to IndexedDB (no localStorage quota issue)
      try {
        await idbSaveImage(id, dataUrl);
      } catch (err) {
        console.error('IndexedDB save failed', err);
        setError('Gagal menyimpan gambar ke browser storage.');
        setIsUploading(false);
        return;
      }

      // Save metadata (without url) to zustand/localStorage
      addCustomTemplate({
        id,
        name: file.name.replace(/\.[^/.]+$/, ''),
        url: dataUrl, // runtime url — will be reloaded from IndexedDB next session
        isCustom: true,
        active: true,
        layout: selectedLayout,
      });

      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setError('Gagal membaca file gambar.');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };


  // Re-upload a broken template (replace image for existing id)
  const handleReupload = (templateId: string) => {
    setReuploadTargetId(templateId);
    reuploadRef.current?.click();
  };

  const handleReuploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !reuploadTargetId) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      let dataUrl = event.target?.result as string;
      if (removeBlack) {
        try { dataUrl = await processImageRemovingBlack(dataUrl); } catch (_) {}
      }
      await idbSaveImage(reuploadTargetId, dataUrl);
      hydrateTemplateUrl(reuploadTargetId, dataUrl);
      setReuploadTargetId(null);
      if (reuploadRef.current) reuploadRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh] p-4">
        <form onSubmit={handleLogin} className="glass-panel p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-500">
            <Lock size={32} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Admin Akses</h1>
          <p className="text-gray-500 text-sm mb-6">Masukkan PIN untuk masuk ke panel admin.</p>
          
          <input 
            type="password" 
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center tracking-[0.5em] font-bold text-lg mb-4 focus:outline-none focus:border-black"
          />
          
          {pinError && <p className="text-red-500 text-sm mb-4">PIN salah!</p>}
          
          <button type="submit" className="btn-primary w-full py-3 mb-4">Masuk</button>
          
          <Link href="/" className="text-sm text-gray-500 hover:text-black transition-colors block">
            Kembali ke Beranda
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-4 border-b border-gray-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Manajemen Template</h1>
          <p className="text-gray-500 text-xs sm:text-sm">Upload frame custom untuk photobooth (Tersimpan di browser lokal)</p>
        </div>
        <Link href="/" className="btn-secondary px-4 py-2 flex items-center gap-2 self-start sm:self-auto text-sm">
          <ArrowLeft size={16} /> Ke Photobooth
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-1">
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload size={18} /> Upload Template
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tata Letak (Jumlah Foto)</label>
              <select 
                value={selectedLayout} 
                onChange={(e) => setSelectedLayout(e.target.value as any)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black"
              >
                <option value="single">1 Foto (Penuh)</option>
                <option value="strip-3">3 Foto (Strip Vertikal)</option>
                <option value="grid-4">4 Foto (Grid 2x2)</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1">Kamera akan memotret sesuai jumlah ini.</p>
            </div>
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer group mb-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-200 transition-colors text-gray-600">
                <Plus size={24} />
              </div>
              <p className="font-medium text-sm mb-1">Klik untuk upload gambar</p>
              <p className="text-xs text-gray-400">PNG / JPG. Maks 2MB.</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/png, image/jpeg, image/webp" 
                className="hidden" 
              />
            </div>
            
            <label className="flex items-start gap-2 p-3 mb-4 bg-gray-50 rounded-lg cursor-pointer border border-gray-100 hover:border-gray-300 transition-colors">
              <input 
                type="checkbox" 
                checked={removeBlack} 
                onChange={(e) => setRemoveBlack(e.target.checked)}
                className="mt-1 w-4 h-4 text-black border-gray-300 rounded focus:ring-black"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">Hapus Latar Hitam</div>
                <div className="text-xs text-gray-500 leading-relaxed mt-0.5">Bolongkan warna hitam otomatis.</div>
              </div>
            </label>

            {isUploading && (
              <div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm flex items-center gap-2 text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                Memproses gambar...
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Templates Gallery */}
        <div className="lg:col-span-2">
          <div className="glass-panel p-6 min-h-[500px]">
            <h2 className="text-lg font-semibold mb-6">Daftar Template</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <div className="aspect-[3/4] relative bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-gray-200 p-4 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {template.url ? (
                      <img
                        src={template.url}
                        alt={template.name}
                        className="max-w-full max-h-full object-contain drop-shadow-md"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : idbLoaded ? (
                      // Image data lost — need re-upload
                      <div className="flex flex-col items-center gap-2 text-center p-2">
                        <div className="text-2xl">⚠️</div>
                        <p className="text-xs text-red-500 font-medium">Gambar hilang</p>
                        <button
                          onClick={() => handleReupload(template.id)}
                          className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-full font-medium flex items-center gap-1"
                        >
                          <Upload size={10} /> Upload Ulang
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">Memuat...</div>
                    )}
                    
                    {!template.active && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="bg-gray-800 px-2 py-1 rounded text-xs font-medium text-white">Nonaktif</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 border-t border-gray-200 flex flex-col gap-3 bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm truncate max-w-[100px]">{template.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{template.isCustom ? 'Custom' : 'Bawaan'}</div>
                      </div>
                      
                      <button 
                        onClick={() => toggleTemplateActive(template.id)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${template.active ? 'bg-black' : 'bg-gray-300'}`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all ${template.active ? 'left-[22px]' : 'left-[3px]'}`} />
                      </button>
                    </div>
                    
                    {template.isCustom && (
                      <button
                        onClick={async () => {
                          if (confirm(`Hapus template ${template.name}?`)) {
                            await idbDeleteImage(template.id);
                            removeCustomTemplate(template.id);
                          }
                        }}
                        className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded transition-colors"
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Hidden input for re-uploading broken templates */}
            <input ref={reuploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleReuploadFile} />

            {templates.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">
                Tidak ada template ditemukan.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
