import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = getStore('snapbooth');
    const meta = await store.get('metadata', { type: 'json' });
    return NextResponse.json(meta || []);
  } catch (error) {
    console.error('Failed to get templates from Netlify Blobs:', error);
    return NextResponse.json([], { status: 500 });
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
