'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { bloques, otrosModulos } from '@/lib/bloques';

export default function Nav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function activo(href: string) {
    if (href === '/') return pathname === '/' ? 'activo' : '';
    return pathname === href || pathname.startsWith(`${href}/`) ? 'activo' : '';
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-marca">
        <span className="sidebar-logo">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 19v-6M10 19V5M16 19v-9M22 19H2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="sidebar-marca-txt">
          <b>sfbathroom</b>
          <span>Cuadro de mando</span>
        </span>
      </div>
      <Link key="/" href="/" className={activo('/')}>
        Resumen
      </Link>

      <p className="nav-group">Cuadro de mando</p>
      {bloques.map((b) => (
        <Link key={b.slug} href={b.slug} className={activo(b.slug)}>
          <span className="nav-numero">{b.numero}</span> {b.titulo}
        </Link>
      ))}
      <Link key="/cuadros" href="/cuadros" className={activo('/cuadros')}>
        Vistas por perfil y cadencia
      </Link>
      <Link key="/configuracion" href="/configuracion" className={activo('/configuracion')}>
        Configuración de umbrales
      </Link>
      <Link key="/documentos" href="/documentos" className={activo('/documentos')}>
        Documentos origen (drill-down)
      </Link>

      <p className="nav-group">Otros módulos</p>
      {otrosModulos.map((m) => (
        <Link key={m.slug} href={m.slug} className={activo(m.slug)}>
          {m.titulo}
        </Link>
      ))}

      {userEmail && (
        <div className="sidebar-usuario">
          <span>{userEmail}</span>
          <button className="logout" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      )}
    </nav>
  );
}