/**
 * Tests de la matriz de acceso por rol. Ejecutar: npm test
 *
 * Lo que se comprueba: que un comercial no pueda entrar a los módulos del
 * cuadro de mando, que sí pueda a los suyos (incluida facturación y stock) y
 * que un rol aún no definido no quede fuera por accidente.
 */
import { puedeEntrar, veCuadroMando, puedeElegirComercial, esRutaVisible } from './roles';

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos += 1;
    console.error(`  FALLO  ${nombre}${detalle ? ` → ${detalle}` : ''}`);
  }
}

console.log('roles · comercial: lo suyo');

{
  comprobar('entra a /comercial', puedeEntrar('comercial', '/comercial'));
  comprobar('entra a la ficha', puedeEntrar('comercial', '/comercial/clientes/abc'));
  comprobar('entra a /facturacion', puedeEntrar('comercial', '/facturacion'));
  comprobar('entra a /stock', puedeEntrar('comercial', '/stock'));
  comprobar('con query string sigue entrando', puedeEntrar('comercial', '/comercial?desde=2026-01-01'));
  comprobar('entra a un futuro /facturacion/detalle', puedeEntrar('comercial', '/facturacion/2026'));
}

console.log('roles · comercial: lo ajeno');

{
  const prohibidas = [
    '/',
    '/mi-panel',
    '/margen',
    '/pedidos',
    '/clientes',
    '/canal-y-marca',
    '/concentracion',
    '/financiero',
    '/marketing',
    '/kpis',
    '/cuadros',
    '/configuracion',
    '/documentos',
    '/datos',
    '/admin',
    '/alertas',
    '/calidad',
    '/actividad-comercial',
    '/rentabilidad-clientes',
    '/credito-cobro',
  ];
  for (const r of prohibidas) {
    comprobar(`NO entra a ${r}`, !puedeEntrar('comercial', r));
  }
  // El detalle importa: /stock no debe abrir /stock-fantasma por prefijo.
  comprobar('no confunde prefijos: /stockx', !puedeEntrar('comercial', '/stockx'));
  comprobar('no confunde prefijos: /facturacionx', !puedeEntrar('comercial', '/facturacionx'));
  comprobar('no confunde prefijos: /comercialx', !puedeEntrar('comercial', '/comercialx'));
}

console.log('roles · dirección ve todo');

{
  for (const r of ['/', '/comercial', '/margen', '/admin', '/financiero', '/stock']) {
    comprobar(`direccion entra a ${r}`, puedeEntrar('direccion', r));
  }
  comprobar('direccion ve el cuadro de mando', veCuadroMando('direccion'));
  comprobar('direccion elige comercial', puedeElegirComercial('direccion'));
  comprobar('comercial NO elige comercial', !puedeElegirComercial('comercial'));
}

console.log('roles · roles en espera y desconocidos');

{
  // Los roles que el cliente ha dejado "en standby" mantienen lo que veían.
  for (const r of ['admin', 'financiero', 'lectura', 'administracion', 'almacen']) {
    comprobar(`${r} entra a /margen (como hasta ahora)`, puedeEntrar(r, '/margen'));
    comprobar(`${r} ve el cuadro de mando`, veCuadroMando(r));
  }
  // Un rol que no conocemos, o ninguno, no se restringe: antes dejar ver de
  // más que dejar fuera a alguien de su trabajo.
  comprobar('rol nulo no se restringe', puedeEntrar(null, '/margen'));
  comprobar('rol desconocido no se restringe', puedeEntrar('comercial_nuevo', '/margen'));
  comprobar('rol nulo ve el cuadro', veCuadroMando(null));
  comprobar('rol nulo no elige comercial', !puedeElegirComercial(null));
}

console.log('roles · el menú y la guarda coinciden');

{
  // Si el menú oculta una ruta, la guarda debe prohibirla: si divergen, el
  // comercial vería un enlace que le rebota, o al revés.
  const rutas = ['/', '/comercial', '/margen', '/stock', '/facturacion', '/admin'];
  for (const r of rutas) {
    comprobar(`coherente en ${r}`, esRutaVisible('comercial', r) === puedeEntrar('comercial', r));
  }
}

if (fallos === 0) console.log('\nTODO OK');
else {
  console.error(`\n${fallos} FALLOS`);
  process.exit(1);
}
