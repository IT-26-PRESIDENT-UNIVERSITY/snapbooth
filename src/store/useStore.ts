import { create } from 'zustand';

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

const defaultTemplates: Template[] = [
  { id: 'builtin-1', name: 'Polaroid Classic', url: '/templates/polaroid.svg', isCustom: false, active: true },
  { id: 'builtin-2', name: 'Neon Cyberpunk', url: '/templates/neon.svg', isCustom: false, active: true },
  { id: 'builtin-3', name: 'Vintage Film', url: '/templates/vintage.svg', isCustom: false, active: true },
];

export const useStore = create<PhotoboothState>()((set, get) => ({
  format: 'single',
  setFormat: (format) => set({ format }),

  templates: defaultTemplates,
  setTemplates: (templates) => set({ templates }),
  
  fetchGlobalTemplates: async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const meta = await res.json();
        const customTemplates: Template[] = meta.map((m: any) => ({
          ...m,
          url: `/api/image/${m.id}`
        }));
        set({ templates: [...defaultTemplates, ...customTemplates] });
      }
    } catch (e) {
      console.error('Failed to fetch global templates', e);
    }
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
