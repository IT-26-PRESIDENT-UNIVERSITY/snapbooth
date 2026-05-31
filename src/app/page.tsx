"use client";

import { useEffect } from 'react';
import PhotoboothStudio from '@/components/PhotoboothStudio';
import { useStore } from '@/store/useStore';
import { idbLoadAllImages } from '@/lib/idb';

export default function Home() {
  const { hydrateTemplateUrl } = useStore();

  // Restore custom template images from IndexedDB on every load
  useEffect(() => {
    idbLoadAllImages().then(images => {
      Object.entries(images).forEach(([id, url]) => {
        hydrateTemplateUrl(id, url);
      });
    }).catch(console.error);
  }, [hydrateTemplateUrl]);

  return (
    <div className="flex-1 w-full bg-background flex flex-col">
      <PhotoboothStudio />
    </div>
  );
}
