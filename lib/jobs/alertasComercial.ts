import { registrarJob, type ContextoJob } from '@/lib/jobs/registro';
import { calcularAlertasComercial, type AlertaComercial } from '@/lib/datos/alertasComercial';
import { enviarEmail } from '@/lib/datos/email';
import { enviarPush } from '@/lib/datos/push';
import { enviarNotificacion } from '@/lib/datos/notificaciones';

const MAX_POR_EMAIL = 15;

type Empresa = { id: string; codigo: string; nombre: string };
type PerfilComercial = { id: string; email: string | null; comercialIds: string[] };
type AlertaConEmpresa = { empresa: Empresa; alerta: AlertaComercial };

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Cuerpo común para email e in-app: críticas primero, agrupadas por empresa. */
function componer(alerts: AlertaConEmpresa[]) {
  const criticas = alerts.filter((a) => a.alerta.severidad === 'critico');
  const avisos = alerts.filter((a) => a.alerta.severidad === 'aviso');

  const porEmpresa = new Map<string, AlertaConEmpresa[]>();
  for (const a of [...criticas, ...avisos]) {
    porEmpresa.set(a.empresa.codigo, [...(porEmpresa.get(a.empresa.codigo) ?? []), a]);
  }

  const bloques: string[] = [];
  const lineasTexto: string[] = [];
  for (const [codigo, lista] of porEmpresa) {
    const nombre = lista[0]?.empresa.nombre ?? codigo;
    const visibles = lista.slice(0, MAX_POR_EMAIL);
    const sobran = lista.length - visibles.length;
    bloques.push(
      `<h3 style="margin:18px 0 6px;font-size:14px">${escapar(nombre)}</h3><ul style="margin:0;padding-left:18px">` +
        visibles
          .map(
            (a) =>
              `<li style="margin-bottom:6px"><strong>${a.alerta.severidad === 'critico' ? 'Crítica' : 'Aviso'}:</strong> ` +
              `${escapar(a.alerta.titulo)}<br><span style="color:#666;font-size:12px">${escapar(a.alerta.detalle)}</span></li>`,
          )
          .join('') +
        (sobran > 0 ? `<li style="color:#666">y ${sobran} alertas más en la app</li>` : '') +
        '</ul>',
    );
    lineasTexto.push(
      `\n${nombre}`,
      ...visibles.map(
        (a) => `- [${a.alerta.severidad === 'critico' ? 'Crítica' : 'Aviso'}] ${a.alerta.titulo} — ${a.alerta.detalle}`,
      ),
      ...(sobran > 0 ? [`- y ${sobran} alertas más en la app`] : []),
    );
  }

  return { criticas: criticas.length, avisos: avisos.length, bloques, lineasTexto };
}

/**
 * Alertas de cartera de cada comercial, enviadas a su propia bandeja.
 *
 * El cálculo se hace una vez por empresa para todos los comerciales y luego se
 * reparte por comercial (`calcularAlertasComercial` no depende de la sesión).
 * Cada comercial recibe un único correo con sus alertas de las tres empresas,
 * más un push y una notificación in-app.
 */
registrarJob({
  nombre: 'alertas-comercial',
  descripcion: 'Recalcula las alertas de cada comercial y se las envía por email, push e in-app.',
  claveDeHoy: (hoy) => `alertas-comercial:${hoy}`,

  ejecutar: async ({ supabase, hoy }: ContextoJob) => {
    const anio = Number(hoy.slice(0, 4));

    const [{ data: empresas }, { data: comerciales }, { data: perfiles }, { data: asignaciones }] = await Promise.all([
      supabase.from('empresas').select('id, codigo, nombre'),
      supabase.from('comerciales').select('id, nombre').eq('activo', true),
      supabase.from('profiles').select('id, comercial_id').eq('role', 'comercial'),
      supabase.from('profiles_comerciales').select('profile_id, comercial_id'),
    ]);

    const empresasLista = (empresas ?? []) as Empresa[];
    const comercialesLista = (comerciales ?? []) as { id: string; nombre: string }[];
    const todosLosIds = comercialesLista.map((c) => c.id);

    // Mapa comercial → perfil(es) que lo llevan (varios comerciales por usuario).
    const comercialesPorPerfil = new Map<string, Set<string>>();
    for (const p of (perfiles ?? []) as { id: string; comercial_id: string | null }[]) {
      const set = comercialesPorPerfil.get(p.id) ?? new Set<string>();
      if (p.comercial_id) set.add(p.comercial_id);
      comercialesPorPerfil.set(p.id, set);
    }
    for (const a of (asignaciones ?? []) as { profile_id: string; comercial_id: string }[]) {
      const set = comercialesPorPerfil.get(a.profile_id) ?? new Set<string>();
      set.add(a.comercial_id);
      comercialesPorPerfil.set(a.profile_id, set);
    }

    if (comercialesPorPerfil.size === 0 || todosLosIds.length === 0) {
      return { ok: true, detalle: 'sin comerciales asignados' };
    }

    // Alertas por comercial, acumulando las de las tres empresas.
    const alertasPorComercial = new Map<string, AlertaConEmpresa[]>();
    for (const empresa of empresasLista) {
      const alertas = await calcularAlertasComercial(supabase, {
        empresaId: empresa.id,
        codigoEmpresa: empresa.codigo,
        comercialIds: todosLosIds,
        anio,
        hoy,
      });
      for (const alerta of alertas) {
        if (!alerta.comercialId) continue;
        const lista = alertasPorComercial.get(alerta.comercialId) ?? [];
        lista.push({ empresa, alerta });
        alertasPorComercial.set(alerta.comercialId, lista);
      }
    }

    if (alertasPorComercial.size === 0) {
      return { ok: true, detalle: 'sin alertas que enviar' };
    }

    // Emails: se leen de Auth (profiles no guarda email) con service_role.
    const emails = new Map<string, string>();
    const { data: usuariosAuth } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of usuariosAuth?.users ?? []) {
      if (u.email) emails.set(u.id, u.email);
    }

    let enviados = 0;
    let sinAlerta = 0;
    let errores = 0;

    for (const [perfilId, comercialIds] of comercialesPorPerfil) {
      const propias: AlertaConEmpresa[] = [];
      for (const id of comercialIds) propias.push(...(alertasPorComercial.get(id) ?? []));
      if (propias.length === 0) {
        sinAlerta += 1;
        continue;
      }

      const { criticas, avisos, bloques, lineasTexto } = componer(propias);
      const asunto =
        criticas > 0
          ? `Tus alertas de cartera · ${criticas} crítica${criticas === 1 ? '' : 's'} · ${hoy}`
          : `Tus alertas de cartera · ${avisos} aviso${avisos === 1 ? '' : 's'} · ${hoy}`;

      const email = emails.get(perfilId);
      if (email) {
        const res = await enviarEmail({
          to: email,
          asunto,
          html:
            `<p>Tienes ${criticas} alerta${criticas === 1 ? '' : 's'} crítica${criticas === 1 ? '' : 's'} ` +
            `y ${avisos} aviso${avisos === 1 ? '' : 's'} en tu cartera.</p>` +
            bloques.join('') +
            `<p style="margin-top:18px"><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sfbathroom-bi.vercel.app'}/alertas-comercial">Ver en la app</a></p>`,
          texto: `Tienes ${criticas} críticas y ${avisos} avisos en tu cartera.${lineasTexto.join('\n')}`,
        });
        if (!res.enviado) errores += 1;
      }

      await enviarPush(
        {
          titulo: criticas > 0 ? `${criticas} alertas críticas en tu cartera` : `${avisos} avisos en tu cartera`,
          cuerpo: propias[0]?.alerta.titulo ?? `Revisa tus alertas del ${hoy}`,
          enlace: '/alertas-comercial',
        },
        perfilId,
      );

      await enviarNotificacion({
        usuarioId: perfilId,
        tipo: 'alerta',
        titulo: asunto.replace(/ · \d{4}-\d{2}-\d{2}$/, ''),
        mensaje: propias
          .slice(0, 3)
          .map((a) => `• ${a.alerta.titulo}`)
          .join('\n'),
        enlace: '/alertas-comercial',
        canales: ['inapp'],
      });

      enviados += 1;
    }

    return {
      ok: errores === 0,
      detalle: `${enviados} comerciales avisados · ${sinAlerta} sin alertas · ${errores} correos fallidos`,
    };
  },
});
