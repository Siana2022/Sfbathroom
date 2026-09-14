import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sfbathroom · BI',
    short_name: 'sfbathroom BI',
    description: 'Cuadros de mando de sfbathroom',
    lang: 'es',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f5f6',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}