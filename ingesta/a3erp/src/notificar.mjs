// Aviso de la ingesta al cuadro de mando (correo) cuando algo falla.
//
// Lo llaman bin/ingesta-diaria.bat y bin/ingesta-semanal.bat SOLO si alguna
// empresa falla. Hace un POST al endpoint de la app
// /api/jobs/aviso-ingesta, que manda el correo con Resend.
//
// Uso:
//   node --env-file=.env src/notificar.mjs --empresa "SF DOT" --modo diario \
//        --ok false --detalle "texto libre"
//
// Necesita en el .env:
//   APP_URL            (p. ej. https://sfbathroom.vercel.app)
//   JOBS_CRON_SECRET   (el mismo que usa la app/Vercel)

const args = process.argv.slice(2);

function arg(nombre, porDefecto = '') {
  const i = args.indexOf(nombre);
  return i === -1 ? porDefecto : (args[i + 1] ?? '');
}

const appUrl = (process.env.APP_URL || 'https://sfbathroom.vercel.app').replace(/\/+$/, '');
const secret = process.env.JOBS_CRON_SECRET;

const cuerpo = {
  empresa: arg('--empresa', '—'),
  modo: arg('--modo', '—'),
  ok: arg('--ok', 'false') === 'true',
  detalle: arg('--detalle', ''),
  origen: arg('--origen', process.env.COMPUTERNAME || 'PC ingesta'),
};

if (!secret) {
  console.error('[aviso] Falta JOBS_CRON_SECRET en el .env: no se envía el correo.');
  process.exit(0);
}

try {
  const res = await fetch(`${appUrl}/api/jobs/aviso-ingesta`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  console.log(`[aviso] ${res.status} ${texto}`);
  // Nunca rompemos la tarea programada por culpa del aviso.
  process.exit(0);
} catch (error) {
  console.error(`[aviso] Error de red al notificar: ${error?.message ?? error}`);
  process.exit(0);
}
