import './globals.css';
import Nav from '@/components/Nav';
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

  return (
    <html lang="es">
      <body>
        {user ? (
          <div className="layout">
            <Nav userEmail={user.email} />
            <main className="content">{children}</main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}