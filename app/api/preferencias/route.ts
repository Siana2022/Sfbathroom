import { NextResponse } from 'next/server';
import { getPrefs, setPrefs } from '@/lib/datos/preferencias';


export async function GET() {
  try {
    const prefs = await getPrefs();
    return NextResponse.json(prefs);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const patch = await req.json();
    if (!patch || typeof patch !== 'object') {
      return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
    }
    const merged = await setPrefs(patch);
    return NextResponse.json(merged);
  } catch (err) {
    const status = err instanceof Error && err.message === 'No autenticado' ? 401 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status });
  }
}