import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const formData = await request.formData();
  const photo = formData.get('photo');

  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'Please choose a circuit photo.' }, { status: 400 });
  }
  if (!photo.type.startsWith('image/') && !photo.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Only image and video files are supported.' }, { status: 415 });
  }
  if (photo.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Use an image smaller than 10 MB.' }, { status: 413 });
  }

  const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

  try {
    const pythonFormData = new FormData();
    pythonFormData.append('photo', photo);

    const response = await fetch(`${PYTHON_API_URL}/diagnose`, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Python API error: ${response.statusText}` }, { status: response.status });
    }

    const result = await response.json();
    
    if (result.error) {
       return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const components = result.detections.map(
      (d: any) => `${d.class} (${(d.confidence * 100).toFixed(0)}%)`
    );

    return NextResponse.json({
      components: components,
      diagnosis: result.diagnosis_message,
      fileName: photo.name,
      annotated_image_url: `${PYTHON_API_URL}/static/${result.annotated_image_filename}`,
      has_faults: result.has_faults,
      summary: result.summary,
      // Reka visual verification — null if API key not configured
      reka: result.reka ?? null,
    });

  } catch (err: any) {
    return NextResponse.json({ error: `Failed to connect to Python API: ${err.message}` }, { status: 500 });
  }
}
