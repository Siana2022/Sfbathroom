/**
 * Tests de periodos del panel comercial. Módulo puro: no necesita Supabase.
 *
 * El caso delicado es el rango anterior: debe durar EXACTAMENTE lo mismo que el
 * periodo elegido para que la comparación de facturación sea justa. Un rango
 * que empieza el día 1 de un mes no puede tener un anterior que también empiece
 * el día 1, porque los meses tienen distinta longitud.
 *
 * Ejecutar: ver README de pruebas (compilar con tsc y correr con node).
 */
import { normalizarRango, rangoAnterior, rangoPorDefecto, diasDeRango } from './periodos';

let fallos = 0;
function comprobar(nombre: string, cond: boolean, detalle = '') {
  if (cond) console.log(`  ok  ${nombre}`);
  else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

console.log('periodos');

{
  const r = normalizarRango('2026-01-01', '2026-03-31');
  comprobar('rango válido se respeta', r.desde === '2026-01-01' && r.hasta === '2026-03-31', JSON.stringify(r));
}

{
  const r = normalizarRango();
  comprobar('sin argumentos: 90 días', diasDeRango(r) === 91, JSON.stringify(r));
}

{
  const r = normalizarRango('ayer', 'mañana');
  const def = rangoPorDefecto();
  comprobar('fechas basura: usa por defecto', r.desde === def.desde && r.hasta === def.hasta, JSON.stringify(r));
}

{
  const r = normalizarRango('2026-06-30', '2026-06-01');
  comprobar('fechas invertidas: se ordenan', r.desde === '2026-06-01' && r.hasta === '2026-06-30', JSON.stringify(r));
}

// Invariante clave: misma duración y termina el día antes.
for (const r of [
  { desde: '2026-04-01', hasta: '2026-06-30' },
  { desde: '2026-06-01', hasta: '2026-06-30' },
  { desde: '2026-01-01', hasta: '2026-12-31' },
  { desde: '2026-02-01', hasta: '2026-02-28' },
  { desde: '2026-06-15', hasta: '2026-06-15' },
]) {
  const a = rangoAnterior(r);
  const etiqueta = `${r.desde}..${r.hasta}`;
  comprobar(`anterior de ${etiqueta}: misma duración`, diasDeRango(a) === diasDeRango(r), `${a.desde}..${a.hasta}`);
  const diaAntes = new Date(Date.parse(r.desde) - 86400000).toISOString().slice(0, 10);
  comprobar(`anterior de ${etiqueta}: termina el día antes`, a.hasta === diaAntes, a.hasta);
}

// Caso que más se presta a error: rango que empieza el día 1 de un mes.
{
  const a = rangoAnterior({ desde: '2026-06-01', hasta: '2026-06-30' });
  comprobar('junio (30 d): anterior son 30 días', diasDeRango(a) === 30, `${a.desde}..${a.hasta}`);
  comprobar('junio (30 d): anterior acaba el 31 may', a.hasta === '2026-05-31', a.hasta);
}

// Febrero de un año bisiesto.
{
  const a = rangoAnterior({ desde: '2028-02-01', hasta: '2028-02-29' });
  comprobar('febrero bisiesto (29 d): anterior son 29 días', diasDeRango(a) === 29, `${a.desde}..${a.hasta}`);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
if (fallos > 0) throw new Error(`${fallos} fallos`);
