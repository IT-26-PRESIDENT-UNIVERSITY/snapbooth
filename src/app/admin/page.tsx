"use client";

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Trash2, Upload, Plus, AlertCircle, ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';

export default function AdminPage() {
  const { templates, fetchGlobalTemplates } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<'single' | 'strip-3' | 'grid-4'>('single');

  useEffect(() => {
    if (isAuthenticated) {
      fetchGlobalTemplates();
    }
  }, [isAuthenticated, fetchGlobalTemplates]);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    const file = files[0];

    // Netlify Functions limit ~6MB payload, so we strictly enforce 2MB per image to be safe
    if (file.size > 2 * 1024 * 1024) {
      setError('Ukuran file maksimal 2MB.');
      setIsUploading(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const id = `custom-${Date.now()}`;

      try {
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            name: file.name.replace(/\.[^/.]+$/, ''),
            layout: selectedLayout,
            imageBase64: dataUrl
          })
        });

        if (!res.ok) throw new Error('Failed to save on server');
        
        await fetchGlobalTemplates();
      } catch (err) {
        console.error('Upload failed', err);
        setError('Gagal mengunggah template ke server.');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setError('Gagal membaca file gambar.');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus template ${name}?`)) return;
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      await fetchGlobalTemplates();
    } catch (err) {
      alert('Gagal menghapus template');
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await fetch(`/api/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      await fetchGlobalTemplates();
    } catch (err) {
      alert('Gagal mengubah status');
    }
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
          <p className="text-gray-500 text-xs sm:text-sm">Upload frame custom untuk photobooth (Tersinkron Global via Netlify)</p>
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
            
            {isUploading && (
              <div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm flex items-center gap-2 text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                Mengunggah ke server...
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
                        onClick={() => handleToggle(template.id, !template.active)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${template.active ? 'bg-black' : 'bg-gray-300'}`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all ${template.active ? 'left-[22px]' : 'left-[3px]'}`} />
                      </button>
                    </div>
                    
                    {template.isCustom && (
                      <button
                        onClick={() => handleDelete(template.id, template.name)}
                        className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded transition-colors"
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

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
