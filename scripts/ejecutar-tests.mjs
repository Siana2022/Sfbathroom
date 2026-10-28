/**
 * Runner de tests sin dependencias externas.
 *
 * El proyecto no usa jest ni vitest: los tests son ficheros `*.test.ts` junto al
 * módulo que prueban, y solo cubren lógica pura (sin Supabase ni Next). Este
 * script los compila con el `tsc` local y ejecuta cada uno con node.
 *
 * Se ignoran a propósito los tests que importen `next/headers` u otros módulos
 * de servidor: esos no se pueden cargar fuera de Next, y por eso la lógica pura
 * vive en `lib/comercial/` (periodos, cartera, cadencia, tipos).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const RAIZ = process.cwd();
const SALIDA = join(RAIZ, '.test-build');

/** Recorre un directorio buscando `*.test.ts`. */
function buscarTests(dir) {
  const encontrados = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...buscarTests(ruta));
    else if (entrada.name.endsWith('.test.ts')) encontrados.push(ruta);
  }
  return encontrados;
}

/** Busca un fichero por nombre dentro de un directorio, recursivamente. */
function buscarPorNombre(dir, nombre) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      const hallado = buscarPorNombre(ruta, nombre);
      if (hallado) return hallado;
    } else if (entrada.name === nombre) {
      return ruta;
    }
  }
  return null;
}

const tests = buscarTests(join(RAIZ, 'lib'));
if (tests.length === 0) {
  console.error('No se han encontrado ficheros *.test.ts en lib/.');
  process.exit(1);
}

rmSync(SALIDA, { recursive: true, force: true });

const tsc = join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc');
const compilar = spawnSync(
  process.execPath,
  [
    tsc,
    ...tests,
    '--outDir', SALIDA,
    '--module', 'commonjs',
    '--target', 'es2020',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--esModuleInterop',
  ],
  { stdio: 'inherit' },
);
if (compilar.status !== 0) {
  console.error('\nFallo al compilar los tests.');
  process.exit(compilar.status ?? 1);
}

let fallos = 0;
for (const test of tests) {
  // tsc aplana según la raíz común de los ficheros de entrada, así que
  // localizamos el compilado por nombre en lugar de reconstruir la ruta.
  const esperado = basename(test).replace(/\.ts$/, '.js');
  const compilado = buscarPorNombre(SALIDA, esperado);
  if (!compilado) {
    console.error(`No se generó ${esperado}`);
    fallos += 1;
    continue;
  }
  console.log(`\n=== ${basename(test)} ===`);
  const r = spawnSync(process.execPath, [compilado], { stdio: 'inherit' });
  if (r.status !== 0) fallos += 1;
}

rmSync(SALIDA, { recursive: true, force: true });

console.log(fallos === 0 ? `\n${tests.length} ficheros de test OK` : `\n${fallos} fichero(s) con fallos`);
process.exit(fallos === 0 ? 0 : 1);
