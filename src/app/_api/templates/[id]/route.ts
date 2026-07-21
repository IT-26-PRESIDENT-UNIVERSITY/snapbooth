import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore('snapbooth');
    
    // Delete image blob
    await store.delete(`image_${id}`);

    // Update metadata list
    let meta: any[] = await store.get('metadata', { type: 'json' }) || [];
    meta = meta.filter((t: any) => t.id !== id);
    await store.setJSON('metadata', meta);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete template from Netlify Blobs:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore('snapbooth');
    const { active } = await req.json();

    let meta: any[] = await store.get('metadata', { type: 'json' }) || [];
    const idx = meta.findIndex((t: any) => t.id === id);
    if (idx !== -1) {
      meta[idx].active = active;
      await store.setJSON('metadata', meta);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update template in Netlify Blobs:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
