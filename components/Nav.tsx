'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { bloques, otrosModulos } from '@/lib/bloques';

export default function Nav({ userEmail, rol }: { userEmail?: string; rol?: string }) {
  const esComercial = rol === 'comercial';
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
          <span>Cuadro mando comercial</span>
        </span>
      </div>
      <Link key="/" href="/" className={activo('/')}>
        Resumen
      </Link>
      {esComercial && (
        <>
          <p className="nav-group">Mi trabajo</p>
          <Link key="/clientes" href="/clientes" className={activo('/clientes')}>
            Clientes
          </Link>
          <Link key="/pedidos" href="/pedidos" className={activo('/pedidos')}>
            Pedidos
          </Link>
          <Link key="/agenda" href="/agenda" className={activo('/agenda')}>
            Mi agenda
          </Link>
          <Link key="/alertas-comercial" href="/alertas-comercial" className={activo('/alertas-comercial')}>
            Mis alertas
          </Link>
        </>
      )}

      {!esComercial && (
        <Link key="/mi-panel" href="/mi-panel" className={activo('/mi-panel')}>
          Mi panel
        </Link>
      )}

      {(rol === 'comercial' ? ['admin','direccion','comercial'] : ['admin','direccion']).includes(rol ?? '') && (
        <Link key="/marketing/campanas" href="/marketing/campanas" className={activo('/marketing/campanas')}>
          Email marketing
        </Link>
      )}

      {!esComercial && <p className="nav-group">Cuadro mando comercial</p>}
      {!esComercial && bloques.map((b) => (
        <Link key={b.slug} href={b.slug} className={activo(b.slug)}>
          <span className="nav-numero">{b.numero}</span> {b.titulo}
        </Link>
      ))}
      {!esComercial && (
        <>
          <Link key="/cuadros" href="/cuadros" className={activo('/cuadros')}>
            Vistas por perfil y cadencia
          </Link>
          <Link key="/configuracion" href="/configuracion" className={activo('/configuracion')}>
            Configuración de umbrales
          </Link>
          <Link key="/documentos" href="/documentos" className={activo('/documentos')}>
            Documentos origen (drill-down)
          </Link>
        </>
      )}

      {!esComercial && <p className="nav-group">Otros módulos</p>}
      {!esComercial && otrosModulos.map((m) => (
        <Link key={m.slug} href={m.slug} className={activo(m.slug)}>
          {m.titulo}
        </Link>
      ))}
      {!esComercial && (
        <>
          <Link key="/admin" href="/admin" className={activo('/admin')}>
            Administración
          </Link>
          <Link key="/datos" href="/datos" className={activo('/datos')}>
            Edición de datos
          </Link>
        </>
      )}

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