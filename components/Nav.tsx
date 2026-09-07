'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const items = [
  { href: '/', label: 'Resumen' },
  { href: '/comercial', label: 'Comercial' },
  { href: '/margen', label: 'Margen por producto' },
  { href: '/stock', label: 'Stock en tiempo real' },
  { href: '/marketing', label: 'Marketing Mix Modeling' },
  { href: '/financiero', label: 'Financiero' }
];

export default function Nav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="sidebar">
      <h1>sfbathroom</h1>
      {items.map((item) => (
        <Link key={item.href} href={item.href} style={{ color: pathname === item.href ? 'var(--accent)' : undefined }}>
          {item.label}
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