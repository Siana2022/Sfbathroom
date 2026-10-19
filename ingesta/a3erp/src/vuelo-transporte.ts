import { leerArgumentos, empresaInfo, cfg } from './config';
import { leerMaestros } from './sqlserver-maestros';
import { normalizarGastosTransporte, cargarGastosTransporte } from './proveedores-transporte';

async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));
  const empresa = empresaInfo(args.empresa ?? cfg.empresaCodigo);
  console.log(`[a3erp-transporte] empresa=${empresa.codigo} base=${empresa.base}`);

  // Consulta de facturas de compra filtrando por los proveedores de transporte identificados
  const sql = `
    SELECT f.FECHA, f.SERIE, f.NUMDOC, f.IDFACC, LTRIM(RTRIM(f.CODPRO)) AS CODPRO, f.NOMPRO, f.BASEMONEDA, f.TOTMONEDA
    FROM [${empresa.base}].dbo.CABEFACC f
    WHERE LTRIM(RTRIM(f.CODPRO)) IN (
      '625', '745', '615', '308', '720', '620', '421', 'P516', '172', '30', '430',
      '802', 'P10018', '671', '33', '626', '258', '534', '458', '568', '653',
      'P596', '453', '718', '746', '296', '247', 'P186', '288', '400', '587',
      '403', '744', '275', '12', '304', '439', '585', '434', '562', '682', '348', '310', '794'
    )
  `;

  const filas = await leerMaestros(sql);
  const gastos = normalizarGastosTransporte(filas, empresa.codigo);
  console.log(`[a3erp-transporte] facturas de transporte extraídas: ${gastos.length}`);

  await cargarGastosTransporte({ empresaCodigo: empresa.codigo, gastos });
  console.log(`[a3erp-transporte] facturas de transporte aplicadas OK`);
}

main().catch((e) => {
  console.error(`[a3erp-transporte] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
