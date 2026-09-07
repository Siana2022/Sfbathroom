import './globals.css';
import Nav from '@/components/Nav';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'sfbathroom · BI',
  description: 'Cuadros de mando de sfbathroom'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rol: string | undefined;
  if (user) {
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    rol = perfil?.role ?? undefined;
  }

  return (
    <html lang="es">
      <body>
        {user ? (
          <div className="layout">
            <Nav userEmail={user.email} />
            <div className="cuerpo">
              <Header rol={rol} />
              <main className="content">{children}</main>
            </div>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}