import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const defaultTemplates = [
  { id: 'builtin-1', name: 'Polaroid Classic', url: '/templates/polaroid.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-2', name: 'Neon Cyberpunk', url: '/templates/neon.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-3', name: 'Vintage Film', url: '/templates/vintage.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-4', name: 'FAISM Pixel', url: '/templates/photostrip-pixel-v3.png', isCustom: false, active: true, layout: 'grid-4' },
];

export async function GET() {
  try {
    const store = getStore('snapbooth');
    let meta: any[] = await store.get('metadata', { type: 'json' }) || [];
    
    // Always ensure ALL built-in templates exist in metadata
    const existingIds = new Set(meta.map((t: any) => t.id));
    let needsUpdate = false;
    for (const dt of defaultTemplates) {
      if (!existingIds.has(dt.id)) {
        meta.push(dt);
        needsUpdate = true;
      }
    }
    if (needsUpdate || meta.length === 0) {
      await store.setJSON('metadata', meta);
    }
    
    return NextResponse.json(meta);
  } catch (error) {
    console.error('Failed to get templates from Netlify Blobs:', error);
    return NextResponse.json(defaultTemplates, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const store = getStore('snapbooth');
    const body = await req.json();
    const { id, name, layout, aspectRatio, imageBase64 } = body;

    if (!id || !imageBase64 || !layout || !aspectRatio) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Save image blob
    await store.set(`image_${id}`, imageBase64);

    // Update metadata list
    let meta: any[] = await store.get('metadata', { type: 'json' }) || [];
    // Remove if exists
    meta = meta.filter((t: any) => t.id !== id);
    
    meta.push({
      id,
      name: name || 'Custom Template',
      layout,
      aspectRatio,
      isCustom: true,
      active: true,
    });

    await store.setJSON('metadata', meta);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save template to Netlify Blobs:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to save', detail: msg }, { status: 500 });
  }
}
