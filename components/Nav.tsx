'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Resumen' },
  { href: '/comercial', label: 'Comercial' },
  { href: '/margen', label: 'Margen por producto' },
  { href: '/stock', label: 'Stock en tiempo real' },
  { href: '/marketing', label: 'Marketing Mix Modeling' },
  { href: '/financiero', label: 'Financiero' }
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sidebar">
      <h1>sfbathroom</h1>
      {items.map((item) => (
        <Link key={item.href} href={item.href} style={{ color: pathname === item.href ? 'var(--accent)' : undefined }}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
