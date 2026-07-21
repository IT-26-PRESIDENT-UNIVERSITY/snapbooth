import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const defaultTemplates = [
  { id: 'builtin-1', name: 'Polaroid Classic', url: '/snapbooth/templates/polaroid.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-2', name: 'Neon Cyberpunk', url: '/snapbooth/templates/neon.svg', isCustom: false, active: true, layout: 'single' },
  { id: 'builtin-3', name: 'Vintage Film', url: '/snapbooth/templates/vintage.svg', isCustom: false, active: true, layout: 'single' },
];

export async function GET() {
  try {
    const store = getStore('snapbooth');
    let meta = await store.get('metadata', { type: 'json' });
    
    // Seed default templates on first run
    if (!meta || !Array.isArray(meta) || meta.length === 0) {
      meta = defaultTemplates;
      await store.setJSON('metadata', meta);
    }
    
    // Ensure built-in templates always exist in metadata in case they were lost
    if (!meta.find((t: any) => t.id === 'builtin-1')) {
       meta = [...defaultTemplates, ...meta.filter((t: any) => t.isCustom)];
       await store.setJSON('metadata', meta);
    }
    
    return NextResponse.json(meta);
  } catch (error) {
    console.error('Failed to get templates from Netlify Blobs:', error);
    return NextResponse.json(defaultTemplates, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const store = getStore('snapbooth');
    const body = await req.json();
    const { id, name, layout, imageBase64 } = body;

    if (!id || !imageBase64) {
      return NextResponse.json({ error: 'Missing id or imageBase64' }, { status: 400 });
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
      layout: layout || 'single',
      isCustom: true,
      active: true,
    });

    await store.setJSON('metadata', meta);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save template to Netlify Blobs:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
