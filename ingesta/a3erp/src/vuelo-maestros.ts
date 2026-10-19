import { leerArgumentos, empresaInfo, cfg } from './config';
import { construirSQLMaestros, construirSQLComerciales, leerMaestros } from './sqlserver-maestros';
import {
  normalizarClientes,
  cargarClientesMaestros,
  normalizarComerciales,
  cargarComercialesMaestros,
} from './maestros';

async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));
  const empresa = empresaInfo(args.empresa ?? cfg.empresaCodigo);
  console.log(`[a3erp-maestros] empresa=${empresa.codigo} base=${empresa.base}`);

  const comerciales = normalizarComerciales(
    await leerMaestros(construirSQLComerciales(empresa.base)),
    empresa.codigo
  );
  console.log(`[a3erp-maestros] comerciales extraídos: ${comerciales.length}`);
  await cargarComercialesMaestros({ empresaCodigo: empresa.codigo, comerciales });
  console.log(`[a3erp-maestros] comerciales aplicados OK`);

  const clientes = normalizarClientes(
    await leerMaestros(construirSQLMaestros(empresa.base)),
    empresa.codigo
  );
  console.log(`[a3erp-maestros] clientes extraídos: ${clientes.length}`);
  await cargarClientesMaestros({ empresaCodigo: empresa.codigo, clientes });
  console.log(`[a3erp-maestros] clientes aplicados OK`);
}

main().catch((e) => {
  console.error(`[a3erp-maestros] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
