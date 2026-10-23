import { leerArgumentos, empresaInfo } from './config';
import { leerMaestros } from './sqlserver-maestros';
import { normalizarStock, cargarStock } from './stock';

const SQL_STOCK = `
SELECT
  LTRIM(RTRIM(A.CODART)) AS CODART,
  A.DESCART AS NOMBRE,
  COALESCE(NULLIF(LTRIM(RTRIM(S.CODALM)), ''), LTRIM(RTRIM(A.CODALM))) AS CODALM,
  COALESCE(M.DESCALM, '') AS NOMALM,
  COALESCE(LTRIM(RTRIM(S.LOTE)), '') AS LOTE,
  ISNULL(S.UNIDADESSTOCK, 0) AS UNIDADESSTOCK,
  S.PRCMEDIO,
  S.FECCADUC,
  COALESCE(S.UBICACION, '') AS UBICACION
FROM [{base}].dbo.ARTICULO A
LEFT JOIN [{base}].dbo.STOCKALM S ON S.CODART = A.CODART
LEFT JOIN [{base}].dbo.ALMACEN M
  ON M.CODALM = COALESCE(NULLIF(LTRIM(RTRIM(S.CODALM)), ''), LTRIM(RTRIM(A.CODALM)))`;

async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));
  const empresa = empresaInfo(args.empresa ?? 'SF');
  console.log(`[a3erp-stock] empresa=${empresa.codigo} base=${empresa.base}`);

  const a3config: any = await import('../config/a3erp.config.json', { assert: { type: 'json' } }).then((m) => m.default);
  const sql = String(a3config.sqlStock?.consulta ?? SQL_STOCK).replaceAll('{base}', empresa.base);

  const filas = await leerMaestros(sql);
  const stock = normalizarStock(filas);
  console.log(`[a3erp-stock] filas extraidas: ${stock.length}`);

  const res = await cargarStock({ empresaCodigo: empresa.codigo, filas: stock });
  console.log(`[a3erp-stock] filas aplicadas: ${res.aplicadas ?? res.count} OK`);
}

main().catch((e) => {
  console.error(`[a3erp-stock] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
