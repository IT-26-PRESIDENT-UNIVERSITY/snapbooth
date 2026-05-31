import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PhotoFormat = 'single' | 'strip2' | 'strip4';
export type TemplateLayout = 'single' | 'strip-3' | 'grid-4';

export interface Template {
  id: string;
  name: string;
  url: string;       // runtime only — loaded from IndexedDB for custom templates
  isCustom: boolean;
  active: boolean;
  layout?: TemplateLayout;
}

interface PhotoboothState {
  format: PhotoFormat;
  setFormat: (format: PhotoFormat) => void;

  templates: Template[];
  setTemplates: (templates: Template[]) => void;
  addCustomTemplate: (template: Template) => void;
  removeCustomTemplate: (id: string) => void;
  toggleTemplateActive: (id: string) => void;
  hydrateTemplateUrl: (id: string, url: string) => void;

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

export const useStore = create<PhotoboothState>()(
  persist(
    (set) => ({
      format: 'single',
      setFormat: (format) => set({ format }),

      templates: defaultTemplates,
      setTemplates: (templates) => set({ templates }),
      addCustomTemplate: (template) =>
        set((state) => ({ templates: [...state.templates, template] })),
      removeCustomTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter(t => t.id !== id),
          selectedTemplate: state.selectedTemplate?.id === id ? null : state.selectedTemplate,
        })),
      toggleTemplateActive: (id) =>
        set((state) => ({
          templates: state.templates.map(t => t.id === id ? { ...t, active: !t.active } : t),
        })),
      // Called on app load to restore image urls from IndexedDB
      hydrateTemplateUrl: (id, url) =>
        set((state) => ({
          templates: state.templates.map(t => t.id === id ? { ...t, url } : t),
          selectedTemplate: state.selectedTemplate?.id === id
            ? { ...state.selectedTemplate, url }
            : state.selectedTemplate,
        })),

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
    }),
    {
      name: 'snapbooth-storage',
      // Only persist metadata — never persist base64 image data (too large for localStorage)
      partialize: (state) => ({
        templates: state.templates.map(t => ({
          ...t,
          url: t.isCustom ? '' : t.url,   // strip base64, will reload from IndexedDB
        })),
      }),
    }
  )
);

