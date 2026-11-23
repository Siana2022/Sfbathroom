import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, hayServiceRole } from '@/lib/supabase/serviceRole';
import { firmaBaja } from '@/lib/marketing/firma';

function pagina(titulo: string, texto: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
     <body style="margin:0;font:16px/1.6 Arial,sans-serif;background:#f5f7fa;color:#1f2933">
       <div style="max-width:560px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;text-align:center">
         <h1 style="font:700 24px/1.3 Georgia,serif">${titulo}</h1>
         <p>${texto}</p>
         <p><a href="https://sfbathroom.com" style="color:#1f3a5f">Volver a sfbathroom.com</a></p>
       </div>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('e') ?? '').trim().toLowerCase();
  const token = req.nextUrl.searchParams.get('t') ?? '';
  if (!email || !email.includes('@') || token !== firmaBaja(email)) {
    return pagina('Enlace no válido', 'El enlace de baja no es correcto o ha caducado.');
  }
  if (!hayServiceRole()) {
    return pagina('No se pudo procesar', 'Inténtalo de nuevo más tarde o escríbenos.');
  }
  const admin = createServiceClient();
  await admin.from('email_bajas').upsert({ email, motivo: 'enlace' }, { onConflict: 'email' });
  return pagina('Te has dado de baja', 'No volverás a recibir nuestros correos comerciales.');
}
