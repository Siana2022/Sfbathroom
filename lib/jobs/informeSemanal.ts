import { registrarJob, type ContextoJob } from '@/lib/jobs/registro';
import { reunirInforme, renderInformeHtml } from '@/lib/jobs/informe';
import { enviarEmail } from '@/lib/datos/email';
import { enviarNotificacion } from '@/lib/datos/notificaciones';

registrarJob({
  nombre: 'informe-semanal',
  descripcion: 'Genera el informe semanal por empresa y lo envía por email (HTML) a dirección/admin.',
  claveDeHoy: (hoy) => `informe-semanal:${hoy}`,

  ejecutar: async ({ supabase, hoy }: ContextoJob) => {
    const anio = new Date().getFullYear();
    const semana = `${hoy.replace(/-/g, ' ')}`; // ISO del día de ejecución (lunes)

    const { data: empresas } = await supabase.from('empresas').select('id, codigo');
    const cosmos = (empresas ?? []) as { id: string; codigo: string }[];

    const detalle: string[] = [];
    for (const e of cosmos) {
      try {
        const datos = await reunirInforme(supabase, e.codigo, anio, `semana del ${hoy}`);
        if (!datos) {
          detalle.push(`${e.codigo}: sin datos`);
          continue;
        }
        const html = renderInformeHtml(datos);
        const texto = datos.topClientes.map((c) => `${c.nombre}: ${c.neta.toLocaleString('es-ES')} €`).join('\n');

        await enviarEmail({
          to: process.env.ALERTAS_EMAIL_TO?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
          asunto: `Informe semanal ${e.codigo} · ${hoy}`,
          html,
          texto: `Resumen ${e.codigo} (${hoy}):\n${texto}`,
        });

        // notificación in-app
        const { data: perfiles } = await supabase.from('profiles').select('id').in('role', ['admin', 'direccion']);
        for (const p of (perfiles ?? []) as { id: string }[]) {
          await enviarNotificacion({
            usuarioId: p.id,
            empresaCodigo: e.codigo,
            tipo: 'informe',
            titulo: `Informe semanal ${e.codigo} · ${hoy}`,
            mensaje: `Informe semanal disponible: facturación ${datos.neta.toLocaleString('es-ES')} €.`,
            enlace: '/financiero',
            canales: ['inapp'],
          });
        }

        detalle.push(`${e.codigo}: email enviado`);
      } catch (err) {
        detalle.push(`${e.codigo}: error`);
        if (err instanceof Error && err.message.includes('SUPABASE_SERVICE_ROLE_KEY')) throw err;
      }
    }

    return { ok: detalle.length > 0, detalle: detalle.join(' | ') };
  },
});