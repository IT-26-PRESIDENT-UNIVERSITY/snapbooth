import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore('snapbooth');
    const imageBase64 = await store.get(`image_${id}`);
    
    if (!imageBase64) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(imageBase64, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error('Failed to get image from Netlify Blobs:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
