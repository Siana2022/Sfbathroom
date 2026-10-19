import mssql from 'mssql';
import { cfg } from './config';

const a3 = await import('../config/a3erp.config.json', { assert: { type: 'json' } }).then((m) => m.default);

export function construirSQLMaestros(base: string): string {
  const consulta = a3.sqlMaestros?.consulta ?? `SELECT * FROM [{base}].dbo.__CLIENTES`;
  return consulta.replaceAll('{base}', base).replace(' {RANGO}', '');
}

export function construirSQLComerciales(base: string): string {
  const consulta =
    a3.sqlMaestros?.consultaComerciales ??
    `SELECT LTRIM(RTRIM(r.CODREP)) AS COD_REP, r.NOMREP AS NOMBRE FROM [{base}].dbo.REPRESEN r`;
  return consulta.replaceAll('{base}', base).replace(' {RANGO}', '');
}

export async function leerMaestros(sql: string): Promise<any[]> {
  const pool = await mssql.connect({ ...cfg.mssql, database: cfg.mssql.database || undefined });
  try {
    const res = await pool.request().query(sql);
    return res.recordset;
  } finally {
    await pool.close();
  }
}
