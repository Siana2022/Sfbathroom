import './globals.css';
import Nav from '@/components/Nav';

export const metadata = {
  title: 'sfbathroom · BI',
  description: 'Cuadros de mando de sfbathroom'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="layout">
          <Nav />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
