import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import '@/lib/jobs';
import { ejecutarJob } from '@/lib/jobs/ejecutar';
import { listarJobs, obtenerJob } from '@/lib/jobs/registro';


const JOBS_SECRET = process.env.JOBS_CRON_SECRET;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';

async function esAdmin(): Promise<boolean> {
  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return perfil?.role === 'admin' || perfil?.role === 'direccion';
}

function verificarSecret(req: NextRequest): boolean {
  if (!JOBS_SECRET) return false;
  // Authorization header (Vercel Cron nativo)
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${JOBS_SECRET}`) return true;
  // Query param (local testing / vercel.json manual)
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === JOBS_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jobName = url.pathname.split('/').pop();

  if (jobName === 'jobs') {
    return NextResponse.json({ jobs: listarJobs().map((j) => ({ nombre: j.nombre, descripcion: j.descripcion })) });
  }

  if (!verificarSecret(req)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const resultado = await ejecutarJob(jobName ?? '');
  const status = resultado.ok ? 200 : 500;
  return NextResponse.json(resultado, { status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const jobName = (body?.job ?? new URL(req.url).pathname.split('/').pop()) as string | undefined;

  if (!jobName || !obtenerJob(jobName)) {
    return NextResponse.json({ error: 'Job no válido.' }, { status: 400 });
  }

  // Cron con secret (GET/POST)
  if (verificarSecret(req)) {
    const r = await ejecutarJob(jobName);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  }

  // Ejecución manual: requiere admin/dirección autenticada
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'No autorizado. Se requiere secret o rol admin/dirección.' }, { status: 401 });
  }

  const r = await ejecutarJob(jobName);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}