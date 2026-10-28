import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Protege todas las rutas excepto assets estáticos e imágenes:
     * - _next/static (ficheros estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico e imágenes
     * - manifest y service worker: si no se excluyen, la guarda por rol los
     *   redirige y la PWA deja de instalarse para los roles restringidos
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};