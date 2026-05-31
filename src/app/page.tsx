"use client";

import { useEffect } from 'react';
import PhotoboothStudio from '@/components/PhotoboothStudio';
import { useStore } from '@/store/useStore';

export default function Home() {
  const { fetchGlobalTemplates } = useStore();

  useEffect(() => {
    fetchGlobalTemplates();
  }, [fetchGlobalTemplates]);

  return (
    <div className="flex-1 w-full bg-background flex flex-col">
      <PhotoboothStudio />
    </div>
  );
}
