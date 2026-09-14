import { registrarJob, type ContextoJob } from '@/lib/jobs/registro';
import { reunirResumen, plantillaResumen } from '@/lib/jobs/reunirResumen';
import { generarNarrativa } from '@/lib/agente/narrativa';
import { enviarNotificacion } from '@/lib/datos/notificaciones';

const AMBITO = 'global';

registrarJob({
  nombre: 'resumen-diario',
  descripcion: 'Genera el resumen ejecutivo diario por empresa y lo notifica por email e in-app.',
  claveDeHoy: (hoy) => `resumen-diario:${hoy}`,

  ejecutar: async ({ supabase, hoy }: ContextoJob) => {
    const anio = new Date().getFullYear();

    // Empresas a procesar: las existentes (v1: todas con código).
    const { data: empresas } = await supabase.from('empresas').select('id, codigo');
    const cosmos = (empresas ?? []) as { id: string; codigo: string }[];

    const detalle: string[] = [];
    for (const e of cosmos) {
      try {
        const datos = await reunirResumen(supabase, e.codigo, anio);
        const plantilla = plantillaResumen(datos);
        const instruct = `Redacta el resumen ejecutivo diario de ${e.codigo} (${datos.empresa}). Máximo 4 frases: evolución de facturación, ticket medio, clientes activos, cumplimiento, DSO/vencido y cualquier señal que requiera atención. Citando las cifras exactas dadas.`;

        const { texto, fuente } = await generarNarrativa(datos as Record<string, unknown>, instruct, () => plantilla);

        const { error } = await supabase.from('resumenes').upsert(
          {
            empresa_id: e.id,
            ambito: AMBITO,
            fecha: hoy,
            texto,
            datos: datos,
            fuente,
          },
          { onConflict: 'empresa_id,ambito,fecha' },
        );
        if (error) throw error;

        // Notificar a dirección/admin (v1: canal email + in-app)
        const { data: perfiles } = await supabase
          .from('profiles')
          .select('id, email, role')
          .in('role', ['admin', 'direccion']);
        const adminIds = (perfiles ?? []).map((p: { id: string }) => p.id);
        for (const uid of adminIds) {
          await enviarNotificacion({
            usuarioId: uid,
            empresaCodigo: e.codigo,
            tipo: 'resumen',
            titulo: `Resumen ejecutivo ${e.codigo} · ${hoy}`,
            mensaje: texto.slice(0, 280),
            enlace: '/',
            canales: ['inapp'],
          });
        }
        await enviarNotificacion({
          tipo: 'resumen',
          titulo: `Resumen ejecutivo ${e.codigo} · ${hoy}`,
          mensaje: texto.slice(0, 280),
          enlace: '/',
          canales: ['email'],
        });

        detalle.push(`${e.codigo}: ok (${fuente})`);
      } catch (err) {
        detalle.push(`${e.codigo}: error`);
        if (err instanceof Error && err.message.includes('SUPABASE_SERVICE_ROLE_KEY')) throw err;
      }
    }

    return { ok: detalle.length > 0, detalle: detalle.join(' | ') };
  },
});