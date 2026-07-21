import { create } from 'zustand';
import { getAllCustomTemplates } from '@/lib/templateDB';

export type PhotoFormat = 'single' | 'strip2' | 'strip4';
export type TemplateLayout = 'single' | 'strip-3' | 'grid-4';

export interface Template {
  id: string;
  name: string;
  url: string;
  isCustom: boolean;
  active: boolean;
  layout?: TemplateLayout;
}

const defaultTemplates: Template[] = [
  { id: 'builtin-1', name: 'Polaroid Classic', url: '/snapbooth/templates/polaroid.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-2', name: 'Neon Cyberpunk', url: '/snapbooth/templates/neon.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-3', name: 'Vintage Film', url: '/snapbooth/templates/vintage.svg', isCustom: false, active: true, layout: 'single' },
];

interface PhotoboothState {
  format: PhotoFormat;
  setFormat: (format: PhotoFormat) => void;

  templates: Template[];
  setTemplates: (templates: Template[]) => void;
  fetchGlobalTemplates: () => Promise<void>;

  selectedTemplate: Template | null;
  setSelectedTemplate: (template: Template | null) => void;

  capturedPhotos: string[];
  addCapturedPhoto: (photoDataUrl: string) => void;
  clearCapturedPhotos: () => void;

  finalImage: string | null;
  setFinalImage: (image: string | null) => void;

  removeBackground: boolean;
  setRemoveBackground: (val: boolean) => void;
}

export const useStore = create<PhotoboothState>()((set, get) => ({
  format: 'single',
  setFormat: (format) => set({ format }),

  templates: [],
  setTemplates: (templates) => set({ templates }),
  
  fetchGlobalTemplates: async () => {
    // Load custom templates from IndexedDB (supports large files)
    const customTemplates = await getAllCustomTemplates();
    set({ templates: [...defaultTemplates, ...customTemplates] });
  },

  selectedTemplate: null,
  setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),

  capturedPhotos: [],
  addCapturedPhoto: (photoDataUrl) =>
    set((state) => ({ capturedPhotos: [...state.capturedPhotos, photoDataUrl] })),
  clearCapturedPhotos: () => set({ capturedPhotos: [], finalImage: null }),

  finalImage: null,
  setFinalImage: (finalImage) => set({ finalImage }),

  removeBackground: false,
  setRemoveBackground: (val) => set({ removeBackground: val }),
}));
