'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { bloques, otrosModulos } from '@/lib/bloques';
import { veCuadroMando } from '@/lib/comercial/roles';

export default function Nav({ userEmail, rol }: { userEmail?: string; rol?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // Un comercial solo ve su módulo. El resto de roles ven el cuadro de mando
  // como hasta ahora; se irán ajustando cuando el cliente los defina.
  const cuadroMando = veCuadroMando(rol);

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

      {cuadroMando && (
        <>
          <Link key="/" href="/" className={activo('/')}>
            Resumen
          </Link>
          <Link key="/mi-panel" href="/mi-panel" className={activo('/mi-panel')}>
            Mi panel
          </Link>

          <p className="nav-group">Cuadro mando comercial</p>
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
        </>
      )}

      <p className="nav-group">Acceso comercial</p>
      <Link
        key="/comercial"
        href="/comercial"
        className={
          pathname === '/comercial' || pathname.startsWith('/comercial/') ? 'activo' : ''
        }
      >
        Acceso comercial
      </Link>

      {!cuadroMando && (
        <>
          {/* El comercial necesita facturación y stock para vender. */}
          <p className="nav-group">Ventas</p>
          <Link key="/facturacion" href="/facturacion" className={activo('/facturacion')}>
            Facturación
          </Link>
          <Link key="/stock" href="/stock" className={activo('/stock')}>
            Stock y cobertura
          </Link>
        </>
      )}

      {cuadroMando && (
        <>
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