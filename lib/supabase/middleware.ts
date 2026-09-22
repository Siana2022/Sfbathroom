import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dgbxualxhrbbqglvxtxq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_0GvTeBiMy4pbE6hZGn5eaw_2xa3W-bi';
const JOBS_SECRET = process.env.JOBS_CRON_SECRET;

function tieneSecretJobs(request: NextRequest): boolean {
  if (!JOBS_SECRET) return false;
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${JOBS_SECRET}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get('secret') === JOBS_SECRET;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const esRutaLogin = path === '/login';
  const esRutaJobs = path === '/api/jobs/jobs' || path.startsWith('/api/jobs/');

  // Cron de Vercel: /api/jobs/* se autentica con JOBS_CRON_SECRET
  // (cabecera Authorization o query ?secret=), sin sesión de usuario.
  if (esRutaJobs && (tieneSecretJobs(request) || path === '/api/jobs/jobs')) {
    return supabaseResponse;
  }
  if (esRutaJobs && !tieneSecretJobs(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !esRutaLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && esRutaLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}