import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const formData = await request.formData();
  const photo = formData.get('photo');

  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'Please choose a circuit photo.' }, { status: 400 });
  }
  if (!photo.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are supported.' }, { status: 415 });
  }
  if (photo.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Use an image smaller than 10 MB.' }, { status: 413 });
  }

  // Replace this stub with the YOLOv8 / Reka pipeline later. The browser-facing
  // response shape can remain unchanged when the real model is introduced.
  return NextResponse.json({
    components: ['Arduino Uno', 'LED', '220 Ω resistor', 'Jumper wires'],
    diagnosis: 'Photo received. Model diagnosis is not connected yet; the image is ready for the detection pipeline.',
    fileName: photo.name
  });
}
