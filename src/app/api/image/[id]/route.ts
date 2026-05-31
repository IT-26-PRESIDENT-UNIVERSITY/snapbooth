import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore('snapbooth');
    const imageBase64 = await store.get(`image_${id}`);
    
    if (!imageBase64) {
      return new NextResponse('Not found', { status: 404 });
    }

    const matches = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      // Fallback in case it was saved as raw text
      return new NextResponse(imageBase64, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error('Failed to get image from Netlify Blobs:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
