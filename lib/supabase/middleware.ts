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

  // getSession lee el JWT de la cookie sin llamar al servidor de Auth en cada
  // navegación; la autorización real la siguen aplicando las políticas RLS.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user && !esRutaLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // El rol comercial solo entra a su "Mi día": el cuadro de mando queda restringido.
  const RUTAS_CUADRO = [
    '/facturacion', '/margen', '/stock', '/transporte',
    '/canal-y-marca', '/concentracion', '/credito-cobro', '/actividad-comercial',
    '/calidad', '/alertas', '/cuadros', '/configuracion', '/documentos', '/admin',
    '/datos', '/mi-panel', '/marketing', '/financiero', '/kpis', '/rentabilidad-clientes',
  ];
  const esRutaCuadro =
    RUTAS_CUADRO.some((r) => path === r || path.startsWith(`${r}/`)) &&
    !path.startsWith('/marketing/campanas') &&
    !path.startsWith('/marketing/plantillas') &&
    !path.startsWith('/configuracion/plantillas-reunion');
  if (user && esRutaCuadro) {
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if ((perfil as { role: string | null } | null)?.role === 'comercial') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  if (user && esRutaLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}