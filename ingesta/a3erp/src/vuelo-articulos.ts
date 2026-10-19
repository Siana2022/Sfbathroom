import { leerArgumentos, empresaInfo, cfg } from './config';
import { leerMaestros } from './sqlserver-maestros';
import { normalizarArticulos, cargarArticulosMaestros } from './articulos';
import { a3 } from './config'; // o directo de config si está ahí

// Leemos la consulta de artículos del config
async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));
  const empresa = empresaInfo(args.empresa ?? cfg.empresaCodigo);
  console.log(`[a3erp-articulos] empresa=${empresa.codigo} base=${empresa.base}`);

  const a3config = await import('../config/a3erp.config.json', { assert: { type: 'json' } }).then((m) => m.default);
  const sql = (a3config.sqlArticulos?.consulta ?? `SELECT LTRIM(RTRIM(CODART)) AS CODART, DESCART, PRCCOSTE, PRECIOBASE, REFART, CODBAR, PESO, VOLUMEN FROM [{base}].dbo.ARTICULO`).replaceAll('{base}', empresa.base);

  const filas = await leerMaestros(sql);
  const articulos = normalizarArticulos(filas, empresa.codigo);
  console.log(`[a3erp-articulos] artículos extraídos: ${articulos.length}`);

  await cargarArticulosMaestros({ empresaCodigo: empresa.codigo, articulos });
  console.log(`[a3erp-articulos] artículos aplicados OK`);
}

main().catch((e) => {
  console.error(`[a3erp-articulos] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
