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
    return pathname === href ? 'var(--accent)' : undefined;
  }

  return (
    <nav className="sidebar">
      <h1>sfbathroom</h1>
      <Link key="/" href="/" style={{ color: activo('/') }}>
        Resumen
      </Link>

      <p className="nav-group">Cuadro de mando</p>
      {bloques.map((b) => (
        <Link key={b.slug} href={b.slug} style={{ color: activo(b.slug) }}>
          <span className="nav-numero">{b.numero}</span> {b.titulo}
        </Link>
      ))}

      <p className="nav-group">Otros módulos</p>
      {otrosModulos.map((m) => (
        <Link key={m.slug} href={m.slug} style={{ color: activo(m.slug) }}>
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