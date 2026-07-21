"use client";

import { useEffect, useState } from 'react';
import { Download, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DownloadPage() {
  const [id, setId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Read ID from URL parameter (e.g., ?id=123)
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('id');

    if (!paramId) {
      setError('ID Foto tidak valid');
      setIsLoading(false);
      return;
    }
    setId(paramId);

    // Attempt to load from localStorage (Simulating backend retrieval)
    const data = localStorage.getItem(`presuniv_booth_photo_${paramId}`);

    
    if (data) {
      setPhotoUrl(data);
    } else {
      setError('Foto tidak ditemukan atau sudah kadaluarsa. Catatan: Karena menggunakan localStorage, QR ini hanya bisa di-scan dari browser yang sama. Gunakan fitur Download langsung jika ingin memindahkan ke HP.');
    }
    
    setIsLoading(false);
  }, [id]);

  const handleDownload = () => {
    if (!photoUrl) return;
    const a = document.createElement('a');
    a.href = photoUrl;
    a.download = `PresUniv-Booth-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 max-w-lg mx-auto w-full relative z-10">
      <div className="glass-panel w-full p-8 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6 text-primary">
          <Download size={32} />
        </div>
        
        <h1 className="text-2xl font-bold mb-2">Download Foto 🎉</h1>
        <p className="text-white/60 mb-8">
          Simpan hasil photobooth ke perangkatmu
        </p>

        {isLoading ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-white/50">Mencari foto...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-8 flex flex-col items-center w-full">
            <AlertCircle size={40} className="text-red-400 mb-3" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        ) : photoUrl ? (
          <div className="w-full flex flex-col items-center mb-8">
            <div className="bg-black/20 p-2 rounded-xl border border-border-dim mb-6 w-full max-w-[300px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={photoUrl} 
                alt="Photobooth Result" 
                className="w-full h-auto rounded-lg"
              />
            </div>
            
            <button 
              onClick={handleDownload}
              className="btn-primary w-full py-4 text-lg flex justify-center items-center gap-2 mb-4"
            >
              <Download size={24} /> Simpan ke Galeri
            </button>
          </div>
        ) : null}

        <Link href="/" className="btn-secondary px-6 py-3 flex items-center justify-center gap-2 w-full mt-auto">
          <ArrowLeft size={18} /> Kembali ke Photobooth
        </Link>
      </div>
    </div>
  );
}
