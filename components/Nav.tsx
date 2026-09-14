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
        <span className="sidebar-logo">SF</span>
        <span className="sidebar-marca-txt">
          <b>Bathroom</b>
          <span>Cuadro de mando</span>
        </span>
      </div>
      <Link key="/" href="/" className={activo('/')}>
        Resumen
      </Link>
      <Link key="/mi-panel" href="/mi-panel" className={activo('/mi-panel')}>
        Mi panel
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
      <Link key="/admin" href="/admin" className={activo('/admin')}>
        Administración
      </Link>
      <Link key="/datos" href="/datos" className={activo('/datos')}>
        Edición de datos
      </Link>

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