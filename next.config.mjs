/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Reutiliza el payload de las páginas dinámicas al volver atrás durante 60 s.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
};
export default nextConfig;
