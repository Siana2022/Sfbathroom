import { leerArgumentos, empresaInfo, cfg } from './config';
import { leerMaestros } from './sqlserver-maestros';
import { normalizarProveedores, cargarProveedoresMaestros } from './proveedores';

async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));
  const empresa = empresaInfo(args.empresa ?? cfg.empresaCodigo);
  console.log(`[a3erp-proveedores] empresa=${empresa.codigo} base=${empresa.base}`);

  const a3config = await import('../config/a3erp.config.json', { assert: { type: 'json' } }).then((m) => m.default);
  const sql = (
    a3config.sqlProveedores?.consulta ??
    `SELECT LTRIM(RTRIM(p.CODPRO)) AS COD_PROVEEDOR, o.NOMBRE AS NOMBRE_PROVEEDOR, o.NOMFISCAL, o.NIF, o.DIR1, o.DIR2, o.POBLACION, o.PROVIFISCAL AS PROVINCIA, o.PAISFISCAL AS PAIS, o.TELEFONO, o.E_MAIL, p.PLAZOSUMINISTRO FROM [{base}].dbo.__PROVEED p LEFT JOIN [{base}].dbo.__ORGANIZACION o ON o.IDORG = p.IDORG`
  ).replaceAll('{base}', empresa.base);

  const filas = await leerMaestros(sql);
  const proveedores = normalizarProveedores(filas, empresa.codigo);
  console.log(`[a3erp-proveedores] proveedores extraídos: ${proveedores.length}`);

  await cargarProveedoresMaestros({ empresaCodigo: empresa.codigo, proveedores });
  console.log(`[a3erp-proveedores] proveedores aplicados OK`);
}

main().catch((e) => {
  console.error(`[a3erp-proveedores] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
